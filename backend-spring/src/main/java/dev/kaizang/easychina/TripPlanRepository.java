package dev.kaizang.easychina;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TripPlanRepository extends JpaRepository<TripPlan, String> {
    List<TripPlan> findTop20ByOrderByCreatedAtDesc();
}