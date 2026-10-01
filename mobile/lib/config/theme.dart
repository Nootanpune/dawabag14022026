import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Brand green matches the website (brand-600 #167A4C / 700 #105C38),
  // chosen for AA contrast on white (Direction A — clinical trust).
  static const Color brandGreen    = Color(0xFF167A4C);
  static const Color brandGreen50  = Color(0xFFEDFAF4);
  static const Color brandGreen100 = Color(0xFFC6EFD9);
  static const Color brandGreen600 = Color(0xFF167A4C);
  static const Color brandGreen700 = Color(0xFF105C38);
  static const Color amberBadge    = Color(0xFFFAEEDA);
  static const Color amberText     = Color(0xFF633806);
  static const Color errorRed      = Color(0xFFE24B4A);

  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: brandGreen,
      primary: brandGreen,
      secondary: brandGreen600,
    ),
    textTheme: GoogleFonts.plusJakartaSansTextTheme(),
    scaffoldBackgroundColor: const Color(0xFFF9FAFB),
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: Colors.grey[800],
      elevation: 0,
      scrolledUnderElevation: 0.5,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 17,
        fontWeight: FontWeight.w600,
        color: Colors.grey[800],
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200, width: 0.5),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.grey.shade50,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: brandGreen, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: brandGreen,
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: GoogleFonts.plusJakartaSans(
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: brandGreen,
        side: const BorderSide(color: brandGreen),
        minimumSize: const Size(double.infinity, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: brandGreen100,
      surfaceTintColor: Colors.transparent,
      height: 64,
      iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? brandGreen700 : const Color(0xFF6B7280),
          )),
      labelTextStyle: WidgetStateProperty.resolveWith((states) => GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? brandGreen700 : const Color(0xFF6B7280),
          )),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: Colors.white,
      selectedItemColor: brandGreen,
      unselectedItemColor: Color(0xFF9CA3AF),
      showUnselectedLabels: true,
      type: BottomNavigationBarType.fixed,
    ),
  );

  static ThemeData get dark => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: brandGreen,
      brightness: Brightness.dark,
      primary: const Color(0xFF2EBB77),
    ),
    textTheme: GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme),
    scaffoldBackgroundColor: const Color(0xFF111827),
  );
}
