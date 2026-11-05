package com.tomatoinsight.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.tomatoinsight.api.ValidationResponse
import com.tomatoinsight.ui.theme.TomatoGreen

private val InvalidTitle = Color(0xFFB45309)
private val SubtitleInk = Color(0xFF586279)
private val BodyMuted = Color(0xFF757575)
private val BodyInk = Color(0xFF222222)

/** Matches website `primaryInvalidReason` in TomatoLeafValidation.js */
fun ValidationResponse.invalidLeafHighlightReason(): String {
    val detected = detectedClass
    if (detected.isNullOrBlank()) {
        return if (message?.contains("No tomato leaf", ignoreCase = true) == true) {
            "quality"
        } else {
            "quality"
        }
    }
    val key = detected.lowercase().replace(Regex("[^a-z0-9]"), "")
    if (
        key.contains("nontomato") ||
        key.contains("nottomato") ||
        key.contains("nonleaf") ||
        key.contains("notleaf") ||
        isNotTomato
    ) {
        return "not-leaf"
    }
    val floor = minConfidence ?: 0.5
    val conf = confidence ?: 0.0
    return if (conf < floor) "quality" else "not-leaf"
}

/**
 * Same content as the website `#validation-alert` invalid-image state
 * (title “Invalid Image”, reasons, recommendations, reminder, green OK).
 */
@Composable
fun InvalidLeafValidationDialog(
    highlightReason: String,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = Color.White,
            shadowElevation = 12.dp
        ) {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 16.dp)
            ) {
                Text(
                    text = "Invalid Image",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = InvalidTitle
                )
                Spacer(modifier = Modifier.height(16.dp))
                ValidationGuideBlock(
                    title = "Reasons",
                    items = listOf(
                        "not-leaf" to "Not a Tomato Leaf",
                        "quality" to "Low quality Image",
                        "background" to "Too much background"
                    ),
                    highlightKey = highlightReason
                )
                Spacer(modifier = Modifier.height(12.dp))
                ValidationGuideBlock(
                    title = "Recommendations",
                    items = listOf(
                        "tip-1" to "Upload only one leaf on the image",
                        "tip-2" to "Upload good quality image"
                    ),
                    highlightKey = null
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Fill the frame with a single tomato leaf, use bright even light, and avoid busy backgrounds. " +
                        "When you are ready, choose a new photo in the upload area above and try again.",
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    color = BodyMuted
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = TomatoGreen)
                ) {
                    Text(
                        text = "OK",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun ValidationGuideBlock(
    title: String,
    items: List<Pair<String, String>>,
    highlightKey: String?
) {
    Text(
        text = title.uppercase(),
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.3.sp,
        color = SubtitleInk
    )
    Spacer(modifier = Modifier.height(6.dp))
    items.forEach { (key, label) ->
        val match = highlightKey != null && key == highlightKey
        Text(
            text = "• $label",
            fontSize = 14.sp,
            lineHeight = 21.sp,
            fontWeight = if (match) FontWeight.SemiBold else FontWeight.Normal,
            color = if (match) BodyInk else BodyMuted,
            modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
        )
    }
}
