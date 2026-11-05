package com.tomatoinsight.api

import android.content.Context
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ValidationRetrofitClient {

    private const val TAG = "TomatoInsight"

    var BASE_URL: String = ApiConfig.VALIDATION_SERVER_URL
        private set(value) {
            val formattedUrl = if (!value.endsWith("/")) "$value/" else value
            field = formattedUrl
            retrofit = createRetrofit(formattedUrl)
            Log.d(TAG, "Validation server URL set to: $formattedUrl")
        }

    private fun createRetrofit(url: String): Retrofit {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val httpClient = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(120, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .callTimeout(180, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(url)
            .addConverterFactory(GsonConverterFactory.create())
            .client(httpClient)
            .build()
    }

    private var retrofit = createRetrofit(BASE_URL)

    val instance: ValidationApiService
        get() = retrofit.create(ValidationApiService::class.java)

    fun init(context: Context) {
        // Always use ApiConfig as source of truth (local PC or Render).
        // Old Render URLs saved in prefs were causing "Service Suspended" errors
        // while the UI still displayed the local IP.
        BASE_URL = ApiConfig.VALIDATION_SERVER_URL
        context.getSharedPreferences("server_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("validation_server_url", BASE_URL)
            .apply()
    }

    fun updateBaseUrl(context: Context, newUrl: String) {
        var formattedUrl = newUrl.trim()
        if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
            formattedUrl = "http://$formattedUrl"
        }
        if (!formattedUrl.endsWith("/")) {
            formattedUrl = "$formattedUrl/"
        }
        BASE_URL = formattedUrl
        context.getSharedPreferences("server_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("validation_server_url", formattedUrl)
            .apply()
    }
}
