@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.tomatoinsight.ui.screens

import android.app.Activity
import android.content.Context
import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.tomatoinsight.R
import com.tomatoinsight.ui.theme.TomatoRed
import kotlinx.coroutines.launch

private const val ONBOARDING_PREFS = "tomatoinsight_onboarding"
private const val ONBOARDING_COMPLETED = "completed"

private val TimesNewRoman = FontFamily(
    Font(R.font.times_new_roman, FontWeight.Normal),
    Font(R.font.times_new_roman_bold, FontWeight.Bold),
    Font(R.font.times_new_roman_bold, FontWeight.Medium),
    Font(R.font.times_new_roman_bold, FontWeight.SemiBold)
)

fun hasSeenOnboarding(context: Context): Boolean =
    context.getSharedPreferences(ONBOARDING_PREFS, Context.MODE_PRIVATE)
        .getBoolean(ONBOARDING_COMPLETED, false)

fun markOnboardingSeen(context: Context) {
    context.getSharedPreferences(ONBOARDING_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(ONBOARDING_COMPLETED, true)
        .commit()
}

private data class ClassificationSlide(
    val title: String,
    val detail: String,
    val color: Color,
    @DrawableRes val imageRes: Int
)

private val classificationSlides = listOf(
    ClassificationSlide(
        title = "Healthy",
        detail = "An even green leaf with no spots, rings, or curling. TomatoInsight reads this as a healthy plant. Keep watering steady and scan the rest of the farm so new problems show up early.",
        color = Color(0xFF3EAE7A),
        imageRes = R.drawable.onboarding_healthy
    ),
    ClassificationSlide(
        title = "Yellow leaf curl virus",
        detail = "Leaves curl upward, turn yellow, and fruit set drops. Whiteflies spread this virus between plants. Remove severely infected plants and check new growth for whiteflies.",
        color = Color(0xFFE8A317),
        imageRes = R.drawable.onboarding_yellow_leaf_curl
    ),
    ClassificationSlide(
        title = "Early blight",
        detail = "Brown spots with target-like rings, usually on older lower leaves. The fungus can strip foliage if it spreads. Remove infected leaves, water at the base, and open up airflow.",
        color = Color(0xFFFF7A72),
        imageRes = R.drawable.onboarding_early_blight
    ),
    ClassificationSlide(
        title = "Spotted wilt",
        detail = "Bronze or ring spots, wilted tips, and stunted growth from tomato spotted wilt virus. Thrips carry it from plant to plant. Remove infected plants and control thrips before it moves across the farm.",
        color = Color(0xFFC4476A),
        imageRes = R.drawable.onboarding_spotted_wilt
    )
)

@Composable
fun OnboardingScreen(onFinished: () -> Unit) {
    val pagerState = rememberPagerState(pageCount = { classificationSlides.size })
    val scope = rememberCoroutineScope()
    val page = classificationSlides[pagerState.currentPage]

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Black.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
        DisposableEffect(Unit) {
            onDispose {
                val window = (view.context as Activity).window
                window.statusBarColor = TomatoRed.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.White)) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { index ->
            val slide = classificationSlides[index]
            ClassificationPage(
                slide = slide,
                pageIndex = pagerState.currentPage,
                pageCount = classificationSlides.size,
                onContinue = {
                    if (index < classificationSlides.lastIndex) {
                        scope.launch { pagerState.animateScrollToPage(index + 1) }
                    } else {
                        onFinished()
                    }
                }
            )
        }

        TextButton(
            onClick = onFinished,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(top = 4.dp, end = 8.dp)
        ) {
            Text(
                text = "Skip",
                color = Color.White,
                fontSize = 16.sp,
                fontFamily = TimesNewRoman,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun ClassificationPage(
    slide: ClassificationSlide,
    pageIndex: Int,
    pageCount: Int,
    onContinue: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.58f)
                .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp))
        ) {
            Image(
                painter = painterResource(slide.imageRes),
                contentDescription = slide.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Black.copy(alpha = 0.35f),
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.18f)
                            )
                        )
                    )
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 28.dp)
                .navigationBarsPadding()
                .padding(bottom = 20.dp)
        ) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = slide.title,
                color = Color(0xFF1C1B1F),
                fontSize = 32.sp,
                fontFamily = TimesNewRoman,
                fontWeight = FontWeight.Bold,
                lineHeight = 38.sp
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = slide.detail,
                color = Color(0xFF8A8A8E),
                fontSize = 15.sp,
                fontFamily = TimesNewRoman,
                fontWeight = FontWeight.Normal,
                lineHeight = 22.sp
            )
            Spacer(modifier = Modifier.weight(1f))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    repeat(pageCount) { dot ->
                        Box(
                            modifier = Modifier
                                .size(if (dot == pageIndex) 9.dp else 7.dp)
                                .clip(CircleShape)
                                .background(
                                    if (dot == pageIndex) slide.color else Color(0xFFD8D8DC)
                                )
                        )
                    }
                }
                Row(
                    modifier = Modifier
                        .clip(CircleShape)
                        .clickable(onClick = onContinue)
                        .padding(start = 8.dp, top = 4.dp, bottom = 4.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Continue",
                        color = slide.color,
                        fontSize = 16.sp,
                        fontFamily = TimesNewRoman,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(slide.color),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = "Continue",
                            tint = Color.White,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
            }
        }
    }
}
