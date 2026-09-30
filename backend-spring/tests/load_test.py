#!/usr/bin/env python3
"""Small concurrent smoke test for the Spring Boot trip planner.

Examples:
    python3 tests/load_test.py --mode cache --requests 50 --concurrency 10
    python3 tests/load_test.py --mode singleflight --requests 20 --concurrency 20

Each run can make one real AI/map request. The singleflight mode gives all
workers the same fresh request; it does not send 20 different AI requests.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import math
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4


def send_plan(url: str, payload: dict, timeout: float) -> tuple[int, float, bytes, str]:
    request = Request(
        f"{url.rstrip('/')}/api/plan",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    start = time.perf_counter()
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            return response.status, time.perf_counter() - start, body, ""
    except HTTPError as error:
        body = error.read()
        detail = body.decode("utf-8", errors="replace")[:250]
        return error.code, time.perf_counter() - start, body, detail
    except (URLError, TimeoutError) as error:
        return 0, time.perf_counter() - start, b"", str(error)


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[math.ceil(len(ordered) * fraction) - 1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8080")
    parser.add_argument("--mode", choices=("cache", "singleflight"), default="cache")
    parser.add_argument("--requests", type=int, default=50)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--timeout", type=float, default=150)
    args = parser.parse_args()

    if not 1 <= args.requests <= 200 or not 1 <= args.concurrency <= 100:
        parser.error("requests must be 1-200 and concurrency must be 1-100")

    payload = {
        "city": "Toronto",
        "days": 1,
        "interests": "food",
        "pace": "balanced",
        "must_visit": [],
        "surprise_me": False,
        "language": "English",
    }

    expected_body = None
    if args.mode == "cache":
        print("Warming the cache (may make one real AI/map request)...", flush=True)
        status, elapsed, expected_body, error = send_plan(args.url, payload, args.timeout)
        if status != 200:
            print(f"Warm-up failed: HTTP {status}; {error}")
            return 1
        print(f"Warm-up: HTTP 200 in {elapsed:.3f}s", flush=True)
    else:
        payload["interests"] += f", load test {uuid4().hex[:12]}"
        print("Sending one fresh plan request from all workers at once...", flush=True)

    gate = threading.Event()

    def worker() -> tuple[int, float, bytes, str]:
        gate.wait()
        return send_plan(args.url, payload, args.timeout)

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(worker) for _ in range(args.requests)]
        start = time.perf_counter()
        gate.set()
        results = [future.result() for future in as_completed(futures)]
        wall_time = time.perf_counter() - start

    successes = [item for item in results if item[0] == 200]
    failures = [item for item in results if item[0] != 200]
    latencies = [item[1] for item in results]
    bodies = [item[2] for item in successes]
    if expected_body is None and bodies:
        expected_body = bodies[0]
    identical = bool(bodies) and all(body == expected_body for body in bodies)

    print(f"Mode: {args.mode}; requests: {args.requests}; concurrency: {args.concurrency}")
    print(f"HTTP 200: {len(successes)}/{args.requests}; elapsed: {wall_time:.3f}s")
    print(f"Throughput: {args.requests / wall_time:.1f} requests/s")
    print(
        "Latency: "
        f"p50={percentile(latencies, 0.50):.3f}s, "
        f"p95={percentile(latencies, 0.95):.3f}s, "
        f"max={max(latencies):.3f}s"
    )
    print(f"Successful responses identical: {'yes' if identical else 'no'}")
    for status, _, _, error in failures[:3]:
        print(f"Failure: HTTP {status}; {error}")

    return 0 if not failures and identical else 1


if __name__ == "__main__":
    raise SystemExit(main())
