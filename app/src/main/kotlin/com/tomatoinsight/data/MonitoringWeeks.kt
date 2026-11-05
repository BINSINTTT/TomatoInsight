package com.tomatoinsight.data

import android.graphics.Bitmap
import com.tomatoinsight.api.normalizeDiseaseKey
import kotlin.math.abs

const val FIRST_FARM_WEEK = 4
const val LAST_FARM_WEEK = 12
const val MAX_SAVED_WEEKS = LAST_FARM_WEEK - FIRST_FARM_WEEK + 1

const val BAR_HEALTHY = "healthy"
const val BAR_TLCV = "tlcv"
const val BAR_EARLY_BLIGHT = "early_blight"
const val BAR_SPOTTED_WILT = "spotted_wilt"

val MONITORING_BAR_KEYS = listOf(
    BAR_HEALTHY,
    BAR_TLCV,
    BAR_EARLY_BLIGHT,
    BAR_SPOTTED_WILT
)

data class FarmWeekScan(
    val weekNumber: Int,
    val savedAtMillis: Long,
    val savedAtLabel: String,
    val scores: Map<String, Int>,
    val topBarKey: String?,
    val topPct: Int,
    val image: Bitmap?
)

data class MonitoringTile(
    val tileNumber: Int,
    val plantName: String,
    val weeks: List<FarmWeekScan>
)

enum class WeekComparison {
    Improved,
    Worse,
    Same,
    Changed,
    FirstScan,
    None
}

fun TileScanHistory.toMonitoringTiles(
    plantNames: Map<Int, String> = emptyMap()
): List<MonitoringTile> {
    return mapNotNull { (tileNumber, scans) ->
        if (scans.isEmpty()) return@mapNotNull null
        val storedWeeks = scans.mapNotNull { scan ->
            val week = scan.weekNumber ?: return@mapNotNull null
            if (week !in FIRST_FARM_WEEK..LAST_FARM_WEEK) return@mapNotNull null
            scan.toFarmWeekScan(week)
        }.distinctBy { it.weekNumber }.sortedBy { it.weekNumber }
        val weeks = if (storedWeeks.isNotEmpty()) {
            storedWeeks
        } else {
            scans.sortedWith(compareBy({ it.scannedAtMillis }, { it.scanId }))
                .take(MAX_SAVED_WEEKS)
                .mapIndexed { index, scan -> scan.toFarmWeekScan(FIRST_FARM_WEEK + index) }
        }
        val savedName = plantNames[tileNumber]?.trim().orEmpty()
        MonitoringTile(
            tileNumber = tileNumber,
            plantName = savedName.ifEmpty { "Tile $tileNumber" },
            weeks = weeks
        )
    }.sortedBy { it.tileNumber }
}

fun previousSavedWeek(weeks: List<FarmWeekScan>, chosen: FarmWeekScan): FarmWeekScan? {
    val index = weeks.indexOfFirst { it.weekNumber == chosen.weekNumber }
    if (index <= 0) return null
    return weeks[index - 1]
}

fun compareSavedWeeks(past: FarmWeekScan?, chosen: FarmWeekScan?): WeekComparison {
    if (chosen == null) return WeekComparison.None
    if (past == null) return WeekComparison.FirstScan

    val sameClass = past.topBarKey != null && past.topBarKey == chosen.topBarKey
    if (sameClass && abs(chosen.topPct - past.topPct) <= 0.05) {
        return WeekComparison.Same
    }

    if (past.topBarKey == null || chosen.topBarKey == null) {
        val bothMissing = past.topBarKey == null && chosen.topBarKey == null
        return if (bothMissing && abs(chosen.topPct - past.topPct) <= 0.05) {
            WeekComparison.Same
        } else {
            WeekComparison.Changed
        }
    }

    val pastHealthy = past.topBarKey == BAR_HEALTHY
    val chosenHealthy = chosen.topBarKey == BAR_HEALTHY
    if (!pastHealthy && chosenHealthy) return WeekComparison.Improved
    if (pastHealthy && !chosenHealthy) return WeekComparison.Worse

    if (sameClass && !chosenHealthy && chosen.topPct < past.topPct) return WeekComparison.Improved
    if (sameClass && !chosenHealthy && chosen.topPct > past.topPct) return WeekComparison.Worse
    if (sameClass && chosenHealthy && chosen.topPct > past.topPct) return WeekComparison.Improved
    if (sameClass && chosenHealthy && chosen.topPct < past.topPct) return WeekComparison.Worse

    if (past.topBarKey != chosen.topBarKey) return WeekComparison.Changed
    return WeekComparison.Same
}

fun monitoringResultLabel(topBarKey: String?): String? = when (topBarKey) {
    BAR_HEALTHY -> "Healthy"
    BAR_TLCV -> "TLCV"
    BAR_EARLY_BLIGHT -> "Early Blight"
    BAR_SPOTTED_WILT -> "Spotted Wilt"
    else -> null
}

fun barKeyForDiseaseName(name: String): String? {
    val key = normalizeDiseaseKey(name)
    return when {
        key == "healthy" -> BAR_HEALTHY
        key.contains("yellowleafcurl") || key == "tlcv" || key.contains("tylcv") -> BAR_TLCV
        key.contains("earlyblight") -> BAR_EARLY_BLIGHT
        key.contains("spottedwilt") || key == "tswv" -> BAR_SPOTTED_WILT
        else -> null
    }
}

private fun TileScanResult.toFarmWeekScan(weekNumber: Int): FarmWeekScan {
    val scoreMap = linkedMapOf<String, Int>()
    scores.forEach { score ->
        val key = barKeyForDiseaseName(score.name) ?: return@forEach
        scoreMap[key] = score.percent.coerceIn(0, 100)
    }
    return FarmWeekScan(
        weekNumber = weekNumber,
        savedAtMillis = scannedAtMillis,
        savedAtLabel = formattedDate,
        scores = scoreMap,
        topBarKey = barKeyForDiseaseName(diseaseName),
        topPct = percent.coerceIn(0, 100),
        image = image
    )
}
