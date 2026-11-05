package com.tomatoinsight.data

data class ProfileNameParts(
    val firstName: String = "",
    val middleName: String = "",
    val lastName: String = ""
) {
    val displayName: String
        get() = listOf(firstName, middleName, lastName)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString(" ")
}

fun parseProfileName(displayName: String?): ProfileNameParts {
    if (displayName.isNullOrBlank()) return ProfileNameParts()

    val parts = displayName.trim().split(Regex("\\s+"))
    return when (parts.size) {
        1 -> ProfileNameParts(firstName = parts[0])
        2 -> ProfileNameParts(firstName = parts[0], lastName = parts[1])
        else -> ProfileNameParts(
            firstName = parts.first(),
            middleName = parts.subList(1, parts.lastIndex).joinToString(" "),
            lastName = parts.last()
        )
    }
}
