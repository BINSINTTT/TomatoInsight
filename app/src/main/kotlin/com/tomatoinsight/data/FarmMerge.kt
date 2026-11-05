package com.tomatoinsight.data

/** Keep the later scan, and prefer a copy that still has its photo. */
private fun preferredScan(first: TileScanResult, second: TileScanResult): TileScanResult {
    val newer = if (second.scannedAtMillis >= first.scannedAtMillis) second else first
    val older = if (newer === second) first else second
    return if (newer.image == null && older.image != null) {
        newer.copy(image = older.image)
    } else {
        newer
    }
}

private fun latestMillis(scans: List<TileScanResult>?): Long =
    scans?.maxOfOrNull { it.scannedAtMillis } ?: 0L

private fun farmWeekOf(scan: TileScanResult): Int {
    val week = if (scan.weekNumber == 3) FIRST_FARM_WEEK else scan.weekNumber
    return week?.takeIf { it in FIRST_FARM_WEEK..LAST_FARM_WEEK } ?: FIRST_FARM_WEEK
}

/**
 * A past deletion does not hide a plant that was saved again later.
 * Only tiles whose latest delete is newer than any remaining scan are gone.
 *
 * If the delete timestamp is missing but Firestore no longer has that tile,
 * treat the plant as deleted so the phone cannot restore a website delete.
 */
fun activeDeletedTiles(
    deletions: List<FarmDeletion>,
    localHistory: Map<Int, List<TileScanResult>> = emptyMap(),
    cloudHistory: Map<Int, List<TileScanResult>> = emptyMap()
): Set<Int> {
    if (deletions.isEmpty()) return emptySet()
    return deletions.groupBy { it.tileNumber }.mapNotNull { (tile, entries) ->
        val deletedAt = entries.maxOf { it.deletedAtMillis.coerceAtLeast(0L) }
        val localNewest = latestMillis(localHistory[tile])
        val cloudNewest = latestMillis(cloudHistory[tile])
        when {
            // Website removed the tile and still has a delete record — honor it unless
            // this phone saved a newer wall-clock scan after that delete.
            deletedAt > 0L && cloudNewest <= 0L && localNewest > deletedAt -> null
            deletedAt > 0L && cloudNewest <= 0L -> tile
            deletedAt > 0L && maxOf(localNewest, cloudNewest) < deletedAt -> tile
            // Bad/missing timestamp: trust Firestore — no tile doc means deleted.
            deletedAt <= 0L && cloudNewest <= 0L -> tile
            else -> null
        }
    }.toSet()
}

/**
 * Keep phone-only plants that are not on Firestore yet (offline saves),
 * without resurrecting tiles the website deleted.
 */
fun keepOfflineOnlyPlants(
    mergedHistory: Map<Int, List<TileScanResult>>,
    mergedNames: Map<Int, String>,
    localHistory: Map<Int, List<TileScanResult>>,
    localNames: Map<Int, String>,
    cloudHistory: Map<Int, List<TileScanResult>>,
    cloudNames: Map<Int, String>,
    deletedTiles: Set<Int>
): Pair<Map<Int, List<TileScanResult>>, Map<Int, String>> {
    val history = mergedHistory.toMutableMap()
    localHistory.forEach { (tile, scans) ->
        if (tile in deletedTiles || scans.isEmpty()) return@forEach
        if (cloudHistory.containsKey(tile) || cloudNames.containsKey(tile)) return@forEach
        history[tile] = mergeScanLists(scans, history[tile].orEmpty())
    }
    val names = mergedNames.toMutableMap()
    localNames.forEach { (tile, name) ->
        val trimmed = name.trim()
        if (tile in deletedTiles || trimmed.isEmpty()) return@forEach
        if (cloudHistory.containsKey(tile) || cloudNames.containsKey(tile)) return@forEach
        if (names[tile].isNullOrBlank()) names[tile] = trimmed
    }
    return history to names
}

/**
 * Union of phone and website scans. The website stores one row per farm week,
 * so a newer offline save for the same week replaces the older cloud row.
 */
fun mergeScanLists(
    local: List<TileScanResult>,
    cloud: List<TileScanResult>
): List<TileScanResult> {
    val byWeek = linkedMapOf<Int, TileScanResult>()
    (cloud + local).forEach { scan ->
        val week = farmWeekOf(scan)
        val current = byWeek[week]
        byWeek[week] = if (current == null) scan else preferredScan(current, scan)
    }
    return byWeek.values.sortedByDescending { it.scannedAtMillis }
}

fun mergeScanHistories(
    local: Map<Int, List<TileScanResult>>,
    cloud: Map<Int, List<TileScanResult>>,
    deletedTiles: Set<Int> = emptySet()
): Map<Int, List<TileScanResult>> {
    val tiles = (local.keys + cloud.keys) - deletedTiles
    return tiles.mapNotNull { tile ->
        val merged = mergeScanLists(local[tile].orEmpty(), cloud[tile].orEmpty())
        if (merged.isEmpty()) null else tile to merged
    }.toMap()
}

fun mergePlantNames(
    local: Map<Int, String>,
    cloud: Map<Int, String>,
    localHistory: Map<Int, List<TileScanResult>>,
    cloudHistory: Map<Int, List<TileScanResult>>,
    deletedTiles: Set<Int> = emptySet()
): Map<Int, String> {
    val tiles = (local.keys + cloud.keys) - deletedTiles
    return tiles.mapNotNull { tile ->
        val localName = local[tile]?.trim().orEmpty()
        val cloudName = cloud[tile]?.trim().orEmpty()
        val name = when {
            localName.isNotEmpty() && (
                cloudName.isEmpty() ||
                    latestMillis(localHistory[tile]) >= latestMillis(cloudHistory[tile])
                ) -> localName
            cloudName.isNotEmpty() -> cloudName
            else -> return@mapNotNull null
        }
        tile to name
    }.toMap()
}

fun mergeDeletions(
    local: List<FarmDeletion>,
    cloud: List<FarmDeletion>
): List<FarmDeletion> {
    val byId = linkedMapOf<String, FarmDeletion>()
    (cloud + local).forEach { entry ->
        val key = entry.id.ifBlank { "${entry.tileNumber}-${entry.deletedAtMillis}" }
        val current = byId[key]
        if (current == null || entry.deletedAtMillis >= current.deletedAtMillis) {
            byId[key] = entry
        }
    }
    return byId.values.sortedByDescending { it.deletedAtMillis }
}

/** Keep every live local plant that a cloud snapshot failed to parse. */
fun keepLivePlants(
    mergedHistory: Map<Int, List<TileScanResult>>,
    mergedNames: Map<Int, String>,
    localHistory: Map<Int, List<TileScanResult>>,
    localNames: Map<Int, String>,
    deletedTiles: Set<Int>
): Pair<Map<Int, List<TileScanResult>>, Map<Int, String>> {
    val history = mergedHistory.toMutableMap()
    localHistory.forEach { (tile, scans) ->
        if (tile in deletedTiles || scans.isEmpty()) return@forEach
        history[tile] = mergeScanLists(scans, history[tile].orEmpty())
    }
    val names = mergedNames.toMutableMap()
    localNames.forEach { (tile, name) ->
        val trimmed = name.trim()
        if (tile in deletedTiles || trimmed.isEmpty()) return@forEach
        if (names[tile].isNullOrBlank()) names[tile] = trimmed
    }
    return history to names
}

fun mergeRecommendations(
    local: Map<Int, SavedRecommendation>,
    cloud: Map<Int, SavedRecommendation>,
    localHistory: Map<Int, List<TileScanResult>>,
    cloudHistory: Map<Int, List<TileScanResult>>,
    deletedTiles: Set<Int> = emptySet()
): Map<Int, SavedRecommendation> {
    val tiles = (local.keys + cloud.keys) - deletedTiles
    return tiles.mapNotNull { tile ->
        val localGuide = local[tile]
        val cloudGuide = cloud[tile]
        val guide = when {
            localGuide != null && (
                cloudGuide == null ||
                    latestMillis(localHistory[tile]) >= latestMillis(cloudHistory[tile])
                ) -> localGuide
            else -> cloudGuide
        } ?: return@mapNotNull null
        tile to guide
    }.toMap()
}
