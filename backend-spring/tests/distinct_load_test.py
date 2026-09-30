#!/usr/bin/env python3
"""Test many different trip requests without calling paid AI/map APIs.

Run from backend-spring:
    python3 tests/distinct_load_test.py --users 1000 --concurrency 1000
The script starts a mock Python planner and a temporary Spring instance,
creates its own MySQL database, then stops both and removes that database.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import Counter
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4

from load_test import percentile


ROOT = Path(__file__).resolve().parents[1]
CITIES = (
    "Toronto", "Vancouver", "Montreal", "Quebec City", "Banff",
    "Ottawa", "Calgary", "Edmonton", "Halifax", "Victoria",
    "Beijing", "Shanghai", "Guilin", "Hangzhou", "Chengdu",
    "Xi'an", "Tokyo", "Paris", "New York", "London",
)
MAVEN = shutil.which("mvn") or (
    "/Applications/IntelliJ IDEA.app/Contents/plugins/maven/lib/maven3/bin/mvn"
)


class MockPlanner(BaseHTTPRequestHandler):
    active = 0
    max_active = 0
    total = 0
    lock = threading.Lock()

    def read_body(self) -> bytes:
        if "chunked" not in self.headers.get("Transfer-Encoding", "").lower():
            return self.rfile.read(int(self.headers.get("Content-Length", "0")))

        chunks = []
        while True:
            size = int(self.rfile.readline().split(b";", 1)[0].strip(), 16)
            if size == 0:
                while self.rfile.readline().strip():
                    pass
                break
            chunks.append(self.rfile.read(size))
            self.rfile.read(2)  # CRLF after each chunk.
        return b"".join(chunks)

    def do_POST(self) -> None:
        if self.path != "/api/plan":
            self.send_error(404)
            return

        request = json.loads(self.read_body())
        with self.lock:
            type(self).active += 1
            type(self).total += 1
            type(self).max_active = max(type(self).max_active, type(self).active)

        try:
            time.sleep(8)  # Keep all eight Spring slots busy past the 5s wait.
            body = json.dumps({"city": request["city"], "days": []}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        finally:
            with self.lock:
                type(self).active -= 1

    def log_message(self, _format: str, *_args: object) -> None:
        pass


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def mysql(sql: str) -> str:
    mysql_env = os.environ.copy()
    mysql_env["MYSQL_PWD"] = os.getenv("MYSQL_PASSWORD", "")
    result = subprocess.run(
        ["mysql", "-h", "127.0.0.1", "-P", "3306", "-u",
         os.getenv("MYSQL_USER", "root"), "-N", "-e", sql],
        check=True,
        capture_output=True,
        text=True,
        env=mysql_env,
    )
    return result.stdout.strip()


def wait_for_spring(port: int, process: subprocess.Popen, seconds: float = 45) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Spring exited with code {process.returncode}")
        try:
            with urlopen(f"http://127.0.0.1:{port}/api/plans", timeout=1):
                return
        except (URLError, TimeoutError):
            time.sleep(0.25)
    raise RuntimeError("Spring did not start within 45 seconds")


async def send_many(port: int, test_id: str, users: int, concurrency: int):
    gate = asyncio.Event()
    slots = asyncio.Semaphore(concurrency)

    async def worker(index: int) -> tuple[int, float, str]:
        async with slots:
            await gate.wait()
            start = time.perf_counter()
            writer = None
            try:
                payload = {
                    "city": CITIES[index % len(CITIES)],
                    "days": 1,
                    "interests": f"food, load test {test_id}-{index}",
                    "pace": "balanced",
                    "must_visit": [],
                    "surprise_me": False,
                    "language": "English",
                }
                body = json.dumps(payload).encode("utf-8")
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection("127.0.0.1", port), timeout=15
                )
                request = (
                    f"POST /api/plan HTTP/1.1\r\n"
                    f"Host: 127.0.0.1:{port}\r\n"
                    "Content-Type: application/json\r\n"
                    f"Content-Length: {len(body)}\r\n"
                    "Connection: close\r\n\r\n"
                ).encode("ascii") + body
                writer.write(request)
                await writer.drain()
                status_line = await asyncio.wait_for(reader.readline(), timeout=30)
                status = int(status_line.split()[1])
                await asyncio.wait_for(reader.read(), timeout=30)
                return status, time.perf_counter() - start, ""
            except (OSError, ValueError, IndexError, asyncio.TimeoutError) as error:
                return 0, time.perf_counter() - start, str(error)
            finally:
                if writer is not None:
                    writer.close()

    tasks = [asyncio.create_task(worker(index)) for index in range(users)]
    await asyncio.sleep(0)  # Let workers reach the shared starting gate.
    started = time.perf_counter()
    gate.set()
    results = await asyncio.gather(*tasks)
    return results, time.perf_counter() - started


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--users", type=int, default=50)
    parser.add_argument("--concurrency", type=int)
    args = parser.parse_args()
    if not 1 <= args.users <= 2000:
        parser.error("--users must be between 1 and 2000")
    concurrency = args.concurrency or args.users
    if not 1 <= concurrency <= args.users:
        parser.error("--concurrency must be between 1 and --users")

    if not Path(MAVEN).is_file():
        raise RuntimeError("Maven not found")

    test_id = uuid4().hex[:10]
    database = f"easychina_load_{test_id}"
    mock = ThreadingHTTPServer(("127.0.0.1", 0), MockPlanner)
    mock.daemon_threads = True
    mock_thread = threading.Thread(target=mock.serve_forever, daemon=True)
    mock_thread.start()
    spring_port = free_port()
    spring = None
    database_created = False

    with tempfile.TemporaryFile(mode="w+t") as spring_log:
        try:
            mysql(f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4")
            database_created = True

            env = os.environ.copy()
            env.update({
                "MYSQL_USER": os.getenv("MYSQL_USER", "root"),
                "MYSQL_PASSWORD": os.getenv("MYSQL_PASSWORD", ""),
                "MYSQL_URL": f"jdbc:mysql://127.0.0.1:3306/{database}",
                "PYTHON_API_URL": f"http://127.0.0.1:{mock.server_port}",
            })
            spring = subprocess.Popen(
                [MAVEN, "-o", "spring-boot:run",
                 f"-Dspring-boot.run.arguments=--server.port={spring_port}"],
                cwd=ROOT,
                env=env,
                stdout=spring_log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            wait_for_spring(spring_port, spring)
            print("Temporary Spring and mock Python planner are ready.", flush=True)

            results, elapsed = asyncio.run(
                send_many(spring_port, test_id, args.users, concurrency)
            )

            statuses = Counter(item[0] for item in results)
            saved = int(mysql(f"SELECT COUNT(*) FROM `{database}`.trip_plans"))
            latencies = [item[1] for item in results]
            print(f"Users: {args.users}; concurrency: {concurrency}; cities: {len(CITIES)}")
            print(f"Distinct requests: {dict(sorted(statuses.items()))}")
            print(f"Elapsed: {elapsed:.2f}s; p95: {percentile(latencies, 0.95):.2f}s")
            print(f"Mock Python max active: {MockPlanner.max_active}")
            print(f"Plans saved in temporary MySQL database: {saved}")
            print("Expected: at most 8 active Python calls; excess requests may get HTTP 429.")
            for status, _, error in results:
                if status == 0:
                    print(f"Connection error sample: {error}")
                    break
            return 0 if (
                statuses[200] > 0
                and MockPlanner.max_active <= 8
                and MockPlanner.total == statuses[200]
                and saved == statuses[200]
                and set(statuses) <= {200, 429}
            ) else 1
        except Exception:
            spring_log.flush()
            spring_log.seek(0)
            print("Spring log (last 2000 characters):")
            print(spring_log.read()[-2000:])
            raise
        finally:
            if spring is not None and spring.poll() is None:
                os.killpg(spring.pid, signal.SIGTERM)
                try:
                    spring.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(spring.pid, signal.SIGKILL)
                    spring.wait()
            mock.shutdown()
            mock.server_close()
            mock_thread.join(timeout=2)
            if database_created:
                mysql(f"DROP DATABASE `{database}`")


if __name__ == "__main__":
    raise SystemExit(main())
