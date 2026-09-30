package dev.kaizang.easychina;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(
    name = "trip_plans",
    indexes = @Index(
        name = "idx_trip_city_created",
        columnList = "city, created_at"
    )
)
public class TripPlan {
    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 100)
    private String city;

    @Column(name = "result_json", nullable = false, columnDefinition = "LONGTEXT")
    private String resultJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TripPlan() {}

    public TripPlan(String city, String resultJson) {
        this.id = UUID.randomUUID().toString();
        this.city = city;
        this.resultJson = resultJson;
        this.createdAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public String getCity() {
        return city;
    }

    public String getResultJson() {
        return resultJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}