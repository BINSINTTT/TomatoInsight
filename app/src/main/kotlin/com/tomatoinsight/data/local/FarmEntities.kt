package com.tomatoinsight.data.local

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "farm_meta",
    primaryKeys = ["userId"]
)
data class FarmMetaEntity(
    val userId: String,
    val rows: Int = 0,
    val columns: Int = 0
)

@Entity(
    tableName = "tile_scans",
    primaryKeys = ["userId", "scanId"],
    indices = [Index(value = ["userId", "tileNumber"])]
)
data class TileScanEntity(
    val userId: String,
    val scanId: Long,
    val scannedAtMillis: Long,
    val tileNumber: Int,
    val weekNumber: Int? = null,
    val diseaseName: String,
    val abbreviation: String,
    val percent: Int,
    val isHealthy: Boolean,
    /** Gson JSON for List<DiseaseScore>. */
    val scoresJson: String,
    /** Gson JSON for ValidationResponse. */
    val responseJson: String,
    val imageFileName: String? = null,
    /** Farm calendar day (yyyy-MM-dd) used for next-scan reminders. */
    val scanDayIso: String = ""
)

@Entity(
    tableName = "plant_names",
    primaryKeys = ["userId", "tileNumber"]
)
data class PlantNameEntity(
    val userId: String,
    val tileNumber: Int,
    val name: String
)

@Entity(
    tableName = "farm_deletions",
    primaryKeys = ["userId", "id"]
)
data class FarmDeletionEntity(
    val userId: String,
    val id: String,
    val tileNumber: Int,
    val plantName: String,
    val deletedAtMillis: Long,
    val deletedAtLabel: String
)
