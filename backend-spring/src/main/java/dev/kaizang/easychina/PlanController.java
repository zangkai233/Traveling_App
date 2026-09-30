package dev.kaizang.easychina;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@RestController
@CrossOrigin(origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173"
})
public class PlanController {
    private final TripPlanRepository plans;
    private final StringRedisTemplate redis;
    private final RestClient python;
    private final Semaphore pythonSlots;

    public PlanController(
            TripPlanRepository plans,
            StringRedisTemplate redis,
            @Value("${planner.python-url}") String pythonUrl,
            @Value("${planner.max-concurrent:8}") int maxConcurrent
    ) {
        this.plans = plans;
        this.redis = redis;
        this.pythonSlots = new Semaphore(maxConcurrent);

        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();

        JdkClientHttpRequestFactory factory =
                new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(120));

        this.python = RestClient.builder()
                .baseUrl(pythonUrl)
                .requestFactory(factory)
                .build();
    }

    @PostMapping(
        value = "/api/plan",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> createPlan(
            @Valid @RequestBody PlanRequest request
    ) {
        // “Surprise Me” 每次都重新生成，不使用缓存。
        if (request.surprise_me()) {
            return json(generateAndSave(request, null));
        }

        String hash = sha256(request.toString());
        String cacheKey = "easychina:plan:" + hash;
        String lockKey = "easychina:lock:" + hash;
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(125);

        while (System.nanoTime() < deadline) {
            String cached = redis.opsForValue().get(cacheKey);
            if (cached != null) {
                return json(cached);
            }

            Boolean acquired = redis.opsForValue()
                    .setIfAbsent(lockKey, "1", Duration.ofSeconds(150));

            if (Boolean.TRUE.equals(acquired)) {
                try {
                    // 防止“刚读完缓存为空，其他请求就写入缓存”的竞态。
                    cached = redis.opsForValue().get(cacheKey);
                    if (cached != null) {
                        return json(cached);
                    }
                    return json(generateAndSave(request, cacheKey));
                } finally {
                    redis.delete(lockKey);
                }
            }

            try {
                Thread.sleep(250);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "Request interrupted"
                );
            }
        }

        throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Planner is busy; please retry"
        );
    }

    private String generateAndSave(PlanRequest request, String cacheKey) {
        boolean acquired;
        try {
            acquired = pythonSlots.tryAcquire(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Request interrupted"
            );
        }

        if (!acquired) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Planner is busy; please retry"
            );
        }

        try {
            String result = python.post()
                    .uri("/api/plan")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(String.class);

            if (result == null || result.isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Python planner returned an empty result"
                );
            }

            plans.save(new TripPlan(request.city().trim(), result));

            if (cacheKey != null) {
                redis.opsForValue().set(
                        cacheKey,
                        result,
                        Duration.ofMinutes(10)
                );
            }

            return result;
        } catch (RestClientResponseException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Python planner returned HTTP " + e.getStatusCode()
            );
        } catch (RestClientException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Cannot reach Python planner",
                    e
            );
        } finally {
            pythonSlots.release();
        }
    }

    @GetMapping("/api/plans")
    public List<PlanSummary> recentPlans() {
        return plans.findTop20ByOrderByCreatedAtDesc()
                .stream()
                .map(plan -> new PlanSummary(
                        plan.getId(),
                        plan.getCity(),
                        plan.getCreatedAt().toString()
                ))
                .toList();
    }

    @GetMapping(
        value = "/api/plans/{id}",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<String> getPlan(@PathVariable String id) {
        TripPlan plan = plans.findById(id).orElseThrow(
                () -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Plan not found"
                )
        );
        return json(plan.getResultJson());
    }

    @DeleteMapping("/api/plans/{id}")
    public ResponseEntity<Void> deletePlan(@PathVariable String id) {
        if (!plans.existsById(id)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Plan not found"
            );
        }
        plans.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<String> json(String body) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public record PlanSummary(
            String id,
            String city,
            String createdAt
    ) {}
}
