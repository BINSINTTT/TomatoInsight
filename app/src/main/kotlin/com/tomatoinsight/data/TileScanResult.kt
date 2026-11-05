package com.tomatoinsight.data

import android.graphics.Bitmap
import com.tomatoinsight.api.DiseasePrediction
import com.tomatoinsight.api.DiseaseScore
import com.tomatoinsight.api.ValidationResponse
import com.tomatoinsight.api.inDiseaseDisplayOrder
import com.tomatoinsight.api.isHealthyDisease
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Disease classification result saved against a single farm tile scan. */
data class TileScanResult(
    val scanId: Long = System.currentTimeMillis(),
    val scannedAtMillis: Long = System.currentTimeMillis(),
    /** Farm calendar day for reminders (yyyy-MM-dd); wall-clock [scannedAtMillis] stays real time for sync. */
    val scanDayIso: String = "",
    val tileNumber: Int,
    val weekNumber: Int? = null,
    val diseaseName: String,
    val abbreviation: String,
    val percent: Int,
    val isHealthy: Boolean,
    val scores: List<DiseaseScore>,
    val response: ValidationResponse,
    val image: Bitmap? = null
) {
    val formattedDate: String
        get() = SCAN_DATE_FORMAT.format(Date(scannedAtMillis))

    /** Every detected disease, highest first. Healthy is omitted. */
    val detectedDiseaseNames: String
        get() {
            val names = scores
                .filter { it.percent > 0 && !isHealthyDisease(it.name) }
                .sortedByDescending { it.percent }
                .map { it.abbreviation.ifBlank { it.name } }
            if (names.isNotEmpty()) return names.joinToString(" · ")
            return if (isHealthy) "Healthy" else abbreviation
        }
}

typealias TileScanHistory = Map<Int, List<TileScanResult>>

fun TileScanHistory.latestFor(tile: Int): TileScanResult? =
    this[tile]?.maxByOrNull { it.scannedAtMillis }

fun TileScanHistory.latestByTile(): Map<Int, TileScanResult> =
    mapNotNull { (tile, scans) ->
        scans.maxByOrNull { it.scannedAtMillis }?.let { tile to it }
    }.toMap()

fun TileScanHistory.scansFor(tile: Int): List<TileScanResult> =
    this[tile]?.sortedByDescending { it.scannedAtMillis }.orEmpty()

/** A classification already stored for this tile. Leaf confidence is not stored with it. */
fun List<DiseaseScore>.asSavedValidationResponse(): ValidationResponse {
    val ordered = inDiseaseDisplayOrder()
    val top = ordered.maxByOrNull { it.percent }
    return ValidationResponse(
        result = "TomatoLeaf",
        confidence = 1.0,
        minConfidence = 0.0,
        stage = "saved",
        topDisease = top?.name,
        topDiseaseConfidence = (top?.percent ?: 0) / 100.0,
        predictions = ordered.map { score ->
            DiseasePrediction(
                className = score.name,
                confidence = score.percent / 100.0
            )
        },
        diseaseClasses = ordered.map { it.name }
    )
}

fun ValidationResponse.toTileScanResult(
    tileNumber: Int,
    image: Bitmap? = null
): TileScanResult? {
    val scores = allDiseaseScores
    val top = scores.maxByOrNull { it.percent } ?: return null
    if (top.percent <= 0) return null

    return TileScanResult(
        tileNumber = tileNumber,
        diseaseName = top.name,
        abbreviation = top.abbreviation,
        percent = top.percent,
        isHealthy = isHealthyDisease(top.name),
        scores = scores,
        response = this,
        image = image?.scaledForTilePreview()
    )
}

private val SCAN_DATE_FORMAT = SimpleDateFormat("MMM d, yyyy · h:mm a", Locale.getDefault())

/** Tile previews are kept small so many saved scans don't exhaust memory. */
private const val MAX_TILE_PREVIEW_SIZE = 720

private fun Bitmap.scaledForTilePreview(): Bitmap {
    if (width <= MAX_TILE_PREVIEW_SIZE && height <= MAX_TILE_PREVIEW_SIZE) return this

    val scale = minOf(
        MAX_TILE_PREVIEW_SIZE.toFloat() / width,
        MAX_TILE_PREVIEW_SIZE.toFloat() / height
    )
    return Bitmap.createScaledBitmap(this, (width * scale).toInt(), (height * scale).toInt(), true)
}
