import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// DAWA BAG brand (Sprint 35; DECISIONS "Adopt the DAWA BAG brand").
///
/// Logo colours from the owner's vector PDF: teal #0397A6 (DAWA), green
/// #87A959 (BAG and handle), grey #565655 (tagline). White on #0397A6 is only
/// 3.5:1, so small text and buttons use darker teal shades with at least 4.5:1
/// (checked in test/sprint35_brand_contrast_test.dart). #0397A6 is kept for the
/// logo and large shapes; the green is a decorative accent, never text.
class AppTheme {
  // ── Brand tokens ───────────────────────────────────────────────────────────
  /// Logo teal: large elements and graphics only (3.5:1 on white).
  static const Color brandTealLogo = Color(0xFF0397A6);
  /// Primary: buttons, links, small text (5.1:1 with white).
  static const Color brandTeal     = Color(0xFF027A86);
  /// Darker teal: text on tinted backgrounds, selected states (7.4:1 on white).
  static const Color brandTeal700  = Color(0xFF015F68);
  static const Color brandTeal50   = Color(0xFFE6F5F6);
  static const Color brandTeal100  = Color(0xFFC2E8EB);
  /// Logo green (BAG + handle): decorative accent only (2.7:1 on white).
  static const Color brandLeaf     = Color(0xFF87A959);
  /// Green dark enough for small text (6.1:1 on white).
  static const Color brandLeafDark = Color(0xFF4E6B2C);
  static const Color brandLeaf50   = Color(0xFFF1F6EA);
  /// Tagline grey: secondary text (7.4:1 on white).
  static const Color brandGrey     = Color(0xFF565655);

  static const Color amberBadge    = Color(0xFFFAEEDA);
  static const Color amberText     = Color(0xFF633806);
  static const Color errorRed      = Color(0xFFE24B4A);

  /// Light page background behind cards.
  static const Color pageBackground = Color(0xFFF9FAFB);

  /// Dark theme primary and the text on it (9.0:1 on the dark page, 6.7:1 on-primary).
  static const Color darkPrimary   = Color(0xFF5CC8D2);
  static const Color darkOnPrimary = Color(0xFF00363C);
  static const Color darkPage      = Color(0xFF111827);

  /// Secondary text: the tagline grey in light mode, the theme's muted colour in dark mode.
  static Color muted(BuildContext context) => Theme.of(context).brightness == Brightness.dark
      ? Theme.of(context).colorScheme.onSurfaceVariant
      : brandGrey;

  /// Pill shape for buttons and single-line fields, as in the owner's mock-ups.
  static const double pillRadius = 28;

  static OutlineInputBorder _field(Color colour, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(pillRadius),
        borderSide: BorderSide(color: colour, width: width),
      );

  static ThemeData get light => lightTheme();
  static ThemeData get dark => darkTheme();

  /// [googleFonts] false keeps the platform font (widget tests run offline).
  static TextStyle _font({required bool googleFonts, double? fontSize, FontWeight? fontWeight, Color? color}) =>
      googleFonts
          ? GoogleFonts.plusJakartaSans(fontSize: fontSize, fontWeight: fontWeight, color: color)
          : TextStyle(fontSize: fontSize, fontWeight: fontWeight, color: color);

  static ThemeData lightTheme({bool googleFonts = true}) => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: brandTealLogo,
      primary: brandTeal,
      onPrimary: Colors.white,
      secondary: brandLeafDark,
      onSecondary: Colors.white,
      tertiary: brandLeaf,
    ),
    textTheme: googleFonts ? GoogleFonts.plusJakartaSansTextTheme() : null,
    scaffoldBackgroundColor: pageBackground,
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: Colors.grey[800],
      elevation: 0,
      scrolledUnderElevation: 0.5,
      titleTextStyle: _font(googleFonts: googleFonts,
        fontSize: 17,
        fontWeight: FontWeight.w600,
        color: Colors.grey[800],
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.grey.shade200, width: 0.5),
      ),
      margin: EdgeInsets.zero,
    ),
    // Labels always stay visible (design review: labels above fields)
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      floatingLabelBehavior: FloatingLabelBehavior.always,
      border: _field(Colors.grey.shade300),
      enabledBorder: _field(Colors.grey.shade300),
      focusedBorder: _field(brandTeal, 1.5),
      errorBorder: _field(errorRed),
      focusedErrorBorder: _field(errorRed, 1.5),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: brandTeal,
        foregroundColor: Colors.white,
        disabledBackgroundColor: Colors.grey.shade300,
        disabledForegroundColor: Colors.grey.shade700,
        minimumSize: const Size(double.infinity, 52),
        shape: const StadiumBorder(),
        textStyle: _font(googleFonts: googleFonts,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: brandTeal,
        foregroundColor: Colors.white,
        shape: const StadiumBorder(),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: brandTeal,
        backgroundColor: Colors.white,
        side: const BorderSide(color: brandTeal),
        minimumSize: const Size(double.infinity, 52),
        shape: const StadiumBorder(),
        textStyle: _font(googleFonts: googleFonts,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: brandTeal),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: brandTeal100,
      surfaceTintColor: Colors.transparent,
      height: 64,
      iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? brandTeal700 : const Color(0xFF6B7280),
          )),
      labelTextStyle: WidgetStateProperty.resolveWith((states) => _font(googleFonts: googleFonts,
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? brandTeal700 : const Color(0xFF6B7280),
          )),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: Colors.white,
      selectedItemColor: brandTeal,
      unselectedItemColor: Color(0xFF6B7280),
      showUnselectedLabels: true,
      type: BottomNavigationBarType.fixed,
    ),
  );

  static ThemeData darkTheme({bool googleFonts = true}) => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: brandTealLogo,
      brightness: Brightness.dark,
      primary: darkPrimary,
      onPrimary: darkOnPrimary,
      secondary: brandLeaf,
    ),
    textTheme: googleFonts ? GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme) : null,
    scaffoldBackgroundColor: darkPage,
    inputDecorationTheme: InputDecorationTheme(
      floatingLabelBehavior: FloatingLabelBehavior.always,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(pillRadius)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: darkPrimary,
        foregroundColor: darkOnPrimary,
        minimumSize: const Size(double.infinity, 52),
        shape: const StadiumBorder(),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: darkPrimary,
        side: const BorderSide(color: darkPrimary),
        minimumSize: const Size(double.infinity, 52),
        shape: const StadiumBorder(),
      ),
    ),
  );
}
