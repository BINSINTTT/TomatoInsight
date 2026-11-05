package com.tomatoinsight.util

private val PASSWORD_LOWERCASE = Regex("[a-z]")
private val PASSWORD_UPPERCASE = Regex("[A-Z]")
private val PASSWORD_SPECIAL_CHAR = Regex("[^a-zA-Z0-9]")

const val PASSWORD_REQUIREMENTS_HINT =
    "At least 8 characters, including uppercase, lowercase, and one special character (e.g. !@#\$%)"

fun passwordValidationError(password: String): String? {
    if (password.length < 8) {
        return "Password must be at least 8 characters"
    }
    if (!PASSWORD_LOWERCASE.containsMatchIn(password)) {
        return "Password must include at least one lowercase letter"
    }
    if (!PASSWORD_UPPERCASE.containsMatchIn(password)) {
        return "Password must include at least one uppercase letter"
    }
    if (!PASSWORD_SPECIAL_CHAR.containsMatchIn(password)) {
        return "Password must include at least one special character"
    }
    return null
}
