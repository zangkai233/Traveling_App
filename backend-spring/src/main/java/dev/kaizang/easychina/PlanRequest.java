package dev.kaizang.easychina;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PlanRequest(
        @NotBlank @Size(min = 2, max = 100) String city,
        @Min(1) @Max(3) int days,
        @Size(max = 500) String interests,
        @Pattern(regexp = "relaxed|balanced|fast") String pace,
        @NotNull List<String> must_visit,
        boolean surprise_me,
        @NotBlank String language
) {}