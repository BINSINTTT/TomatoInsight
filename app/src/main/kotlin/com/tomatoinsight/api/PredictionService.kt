package com.tomatoinsight.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/**
 * Direct Roboflow Serverless Workflow client.
 *
 * Stage 1 testing uses [ValidationApiService] → Python on Render instead,
 * so the API key stays on the server. This interface is kept for future
 * direct integration or debugging.
 */
data class WorkflowRequest(
    val inputs: Map<String, ImageInput>
)

data class ImageInput(
    val type: String,
    val value: String
)

interface PredictionService {
    @POST(ApiConfig.ROBOFLOW_WORKFLOW_PATH)
    suspend fun runWorkflow(
        @Header("Authorization") auth: String,
        @Body request: WorkflowRequest
    ): ResponseBody
}
