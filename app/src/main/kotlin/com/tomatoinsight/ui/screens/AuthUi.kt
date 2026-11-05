package com.tomatoinsight.ui.screens

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tomatoinsight.R
import com.tomatoinsight.ui.theme.TomatoGreen
import com.tomatoinsight.ui.theme.TomatoPrimary
import com.tomatoinsight.ui.theme.TomatoRed
import com.tomatoinsight.ui.theme.TomatoRedDark

private val AuthFieldBg = Color(0xFFF3F4F6)
private val AuthMuted = Color(0xFF8A8A8E)
private val AuthInk = Color(0xFF1C1B1F)
/** Light coral-red so “Tomato” stays red and readable on the red auth header. */
private val AuthTomatoWord = Color(0xFFFFC4BC)
private val AuthInsightWord = TomatoGreen
private const val AUTH_PREFS = "tomatoinsight_auth"
private const val KEY_REMEMBER = "remember_email"
private const val KEY_SAVED_EMAIL = "saved_email"

fun readRememberedEmail(context: Context): Pair<Boolean, String> {
    val prefs = context.getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
    val remember = prefs.getBoolean(KEY_REMEMBER, false)
    val email = prefs.getString(KEY_SAVED_EMAIL, "").orEmpty()
    return remember to email
}

fun persistRememberedEmail(context: Context, remember: Boolean, email: String) {
    context.getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KEY_REMEMBER, remember)
        .putString(KEY_SAVED_EMAIL, if (remember) email.trim() else "")
        .apply()
}

@Composable
fun AuthScreenScaffold(
    headerMessage: String,
    scrollContent: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.38f)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(TomatoPrimary, TomatoRedDark)
                    )
                )
                .statusBarsPadding()
                .padding(start = 28.dp, end = 28.dp, top = 16.dp, bottom = 48.dp)
        ) {
            Column(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Image(
                    painter = painterResource(R.drawable.login_logo),
                    contentDescription = "TomatoInsight logo",
                    modifier = Modifier.size(88.dp),
                    contentScale = ContentScale.Fit
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = buildAnnotatedString {
                        withStyle(
                            SpanStyle(
                                color = AuthTomatoWord,
                                fontWeight = FontWeight.Bold,
                                shadow = Shadow(
                                    color = Color(0x66000000),
                                    offset = Offset(0f, 1.5f),
                                    blurRadius = 4f
                                )
                            )
                        ) {
                            append("Tomato")
                        }
                        withStyle(
                            SpanStyle(
                                color = AuthInsightWord,
                                fontWeight = FontWeight.SemiBold
                            )
                        ) {
                            append("Insight")
                        }
                    },
                    fontSize = 28.sp,
                    letterSpacing = 0.4.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = headerMessage,
                    color = Color.White.copy(alpha = 0.92f),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 24.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(0.92f)
                )
            }
        }

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .offset(y = (-28).dp),
            shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp),
            color = Color.White,
            shadowElevation = 6.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .then(
                        if (scrollContent) {
                            Modifier.verticalScroll(rememberScrollState())
                        } else {
                            Modifier
                        }
                    )
                    .padding(horizontal = 28.dp, vertical = 28.dp),
                content = content
            )
        }
    }
}

@Composable
fun AuthTitleBlock(
    title: String,
    prompt: String,
    linkLabel: String,
    onLinkClick: () -> Unit
) {
    Text(
        text = title,
        fontSize = 26.sp,
        fontWeight = FontWeight.Bold,
        color = AuthInk
    )
    Spacer(modifier = Modifier.height(10.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = prompt,
            color = AuthMuted,
            fontSize = 14.sp
        )
        Text(
            text = linkLabel,
            color = TomatoPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .padding(start = 4.dp)
                .clickable(onClick = onLinkClick)
        )
    }
    Spacer(modifier = Modifier.height(24.dp))
}

@Composable
fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    leadingIcon: @Composable () -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
    isPassword: Boolean = false,
    passwordVisible: Boolean = false,
    onTogglePassword: (() -> Unit)? = null
) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(AuthFieldBg)
            .padding(horizontal = 14.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        leadingIcon()
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 14.dp, horizontal = 8.dp),
            singleLine = true,
            textStyle = androidx.compose.ui.text.TextStyle(
                color = AuthInk,
                fontSize = 15.sp
            ),
            visualTransformation = when {
                isPassword && !passwordVisible -> PasswordVisualTransformation()
                else -> VisualTransformation.None
            },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            decorationBox = { inner ->
                if (value.isEmpty()) {
                    Text(placeholder, color = AuthMuted, fontSize = 15.sp)
                }
                inner()
            }
        )
        if (isPassword && onTogglePassword != null) {
            IconButton(onClick = onTogglePassword, modifier = Modifier.size(40.dp)) {
                Icon(
                    imageVector = if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = if (passwordVisible) "Hide password" else "Show password",
                    tint = AuthMuted,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
fun AuthPersonField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String
) {
    AuthTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = placeholder,
        leadingIcon = {
            Icon(Icons.Filled.Person, contentDescription = null, tint = AuthMuted, modifier = Modifier.size(22.dp))
        }
    )
}

@Composable
fun AuthEmailField(value: String, onValueChange: (String) -> Unit, placeholder: String = "Enter your email address") {
    AuthTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = placeholder,
        keyboardType = KeyboardType.Email,
        leadingIcon = {
            Icon(Icons.Filled.Email, contentDescription = null, tint = AuthMuted, modifier = Modifier.size(22.dp))
        }
    )
}

@Composable
fun AuthPasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "Password",
    visible: Boolean,
    onToggleVisible: () -> Unit
) {
    AuthTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = placeholder,
        keyboardType = KeyboardType.Password,
        isPassword = true,
        passwordVisible = visible,
        onTogglePassword = onToggleVisible,
        leadingIcon = {
            Icon(Icons.Filled.Lock, contentDescription = null, tint = AuthMuted, modifier = Modifier.size(22.dp))
        }
    )
}

@Composable
fun AuthRememberForgotRow(
    rememberMe: Boolean,
    onRememberChange: (Boolean) -> Unit,
    onForgotPassword: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = rememberMe,
                onCheckedChange = onRememberChange,
                colors = CheckboxDefaults.colors(
                    checkedColor = TomatoPrimary,
                    uncheckedColor = AuthMuted
                )
            )
            Text("Remember Me", color = AuthMuted, fontSize = 14.sp)
        }
        Text(
            text = "Forgot Password?",
            color = TomatoPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.clickable(onClick = onForgotPassword)
        )
    }
}

@Composable
fun AuthPrimaryButton(
    label: String,
    loading: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = TomatoPrimary,
            disabledContainerColor = TomatoPrimary.copy(alpha = 0.5f)
        ),
        enabled = enabled && !loading
    ) {
        if (loading) {
            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
        } else {
            Text(label, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun AuthErrorText(message: String?) {
    if (message.isNullOrBlank()) return
    Text(
        text = message,
        color = TomatoRed,
        fontSize = 14.sp,
        textAlign = TextAlign.Start,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
    )
}

@Composable
fun AuthSuccessText(message: String?) {
    if (message.isNullOrBlank()) return
    Text(
        text = message,
        color = Color(0xFF2E7D32),
        fontSize = 14.sp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
    )
}
