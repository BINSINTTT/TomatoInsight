package com.tomatoinsight.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        FarmMetaEntity::class,
        TileScanEntity::class,
        PlantNameEntity::class,
        FarmDeletionEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class TomatoInsightDatabase : RoomDatabase() {
    abstract fun farmDao(): FarmDao

    companion object {
        @Volatile
        private var instance: TomatoInsightDatabase? = null

        fun get(context: Context): TomatoInsightDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    TomatoInsightDatabase::class.java,
                    "tomatoinsight.db"
                )
                    .fallbackToDestructiveMigration()
                    .build().also { instance = it }
            }
        }
    }
}
