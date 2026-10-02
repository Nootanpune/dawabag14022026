import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/config/theme.dart';

// Sprint 35: DAWA BAG brand colours. Small text and buttons need at least
// 4.5:1 (WCAG 2.1 AA); large text and graphics at least 3:1. White on the logo
// teal #0397A6 is only ~3.5:1, so buttons use the darker teal shades.

/// WCAG contrast ratio between two opaque colours.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  const white = Colors.white;

  group('brand tokens from the owner\'s logo', () {
    test('logo colours are kept exactly', () {
      expect(AppTheme.brandTealLogo, const Color(0xFF0397A6));
      expect(AppTheme.brandLeaf, const Color(0xFF87A959));
      expect(AppTheme.brandGrey, const Color(0xFF565655));
    });

    test('the logo teal is too light for small white text (why darker shades exist)', () {
      expect(contrast(white, AppTheme.brandTealLogo), lessThan(4.5));
      // ...but fine for the logo and large shapes (3:1)
      expect(contrast(white, AppTheme.brandTealLogo), greaterThanOrEqualTo(3.0));
    });
  });

  group('small text and buttons: at least 4.5:1', () {
    final pairs = <String, (Color, Color)>{
      'white text on the primary button': (white, AppTheme.brandTeal),
      'primary teal text on white': (AppTheme.brandTeal, white),
      'primary teal text on the page background': (AppTheme.brandTeal, AppTheme.pageBackground),
      'primary teal text on the pale teal tint': (AppTheme.brandTeal, AppTheme.brandTeal50),
      'dark teal text on the pale teal tint': (AppTheme.brandTeal700, AppTheme.brandTeal50),
      'dark teal text on the teal 100 tint (nav indicator)': (AppTheme.brandTeal700, AppTheme.brandTeal100),
      'dark teal on white': (AppTheme.brandTeal700, white),
      'readable green text on white (discounts)': (AppTheme.brandLeafDark, white),
      'readable green text on the pale green tint': (AppTheme.brandLeafDark, AppTheme.brandLeaf50),
      'tagline grey text on white': (AppTheme.brandGrey, white),
      'tagline grey text on the page background': (AppTheme.brandGrey, AppTheme.pageBackground),
      'dark theme: text on the primary button': (AppTheme.darkOnPrimary, AppTheme.darkPrimary),
      'dark theme: primary text on the page': (AppTheme.darkPrimary, AppTheme.darkPage),
    };
    for (final e in pairs.entries) {
      test(e.key, () {
        final (fg, bg) = e.value;
        expect(contrast(fg, bg), greaterThanOrEqualTo(4.5),
            reason: '${e.key}: ${contrast(fg, bg).toStringAsFixed(2)}:1');
      });
    }
  });

  group('the themes use those pairs', () {
    test('light theme: primary / on-primary and the filled button', () {
      final theme = AppTheme.lightTheme(googleFonts: false);
      expect(theme.colorScheme.primary, AppTheme.brandTeal);
      expect(contrast(theme.colorScheme.onPrimary, theme.colorScheme.primary), greaterThanOrEqualTo(4.5));
      final style = theme.elevatedButtonTheme.style!;
      final bg = style.backgroundColor!.resolve(<WidgetState>{})!;
      final fg = style.foregroundColor!.resolve(<WidgetState>{})!;
      expect(contrast(fg, bg), greaterThanOrEqualTo(4.5));
      // pill shape, as the owner's mock-ups
      expect(style.shape!.resolve(<WidgetState>{}), isA<StadiumBorder>());
      // labels never disappear into the field
      expect(theme.inputDecorationTheme.floatingLabelBehavior, FloatingLabelBehavior.always);
    });

    test('light theme: disabled buttons are still readable', () {
      final style = AppTheme.lightTheme(googleFonts: false).elevatedButtonTheme.style!;
      final bg = style.backgroundColor!.resolve({WidgetState.disabled})!;
      final fg = style.foregroundColor!.resolve({WidgetState.disabled})!;
      expect(contrast(fg, bg), greaterThanOrEqualTo(4.5));
    });

    test('dark theme: primary / on-primary', () {
      final theme = AppTheme.darkTheme(googleFonts: false);
      expect(contrast(theme.colorScheme.onPrimary, theme.colorScheme.primary), greaterThanOrEqualTo(4.5));
      final style = theme.elevatedButtonTheme.style!;
      expect(
          contrast(style.foregroundColor!.resolve(<WidgetState>{})!, style.backgroundColor!.resolve(<WidgetState>{})!),
          greaterThanOrEqualTo(4.5));
    });
  });
}
