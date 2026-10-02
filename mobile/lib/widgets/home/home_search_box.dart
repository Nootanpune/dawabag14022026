import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../providers/typeahead_provider.dart';
import '../search/typeahead_panel.dart';
import 'search_entry.dart';

/// The home search box (Sprint 32, as the web's home SearchCombobox): typing 2+
/// characters shows a dropdown of matching medicines from the server (250 ms
/// after the last key) with price, Rx badge, stock and Add → − qty +. Submit or
/// "See all results" opens the Search tab with the query. The query is held in
/// memory only.
class HomeSearchBox extends StatefulWidget {
  /// Opens the Search tab for [query] (keyboard Search, "See all results").
  final ValueChanged<String> onSubmitQuery;
  final ValueChanged<String> onOpenProduct;
  final String pincode;
  final Duration debounce;

  const HomeSearchBox({
    super.key,
    required this.onSubmitQuery,
    required this.onOpenProduct,
    this.pincode = '',
    this.debounce = kTypeaheadDebounce,
  });

  @override
  State<HomeSearchBox> createState() => _HomeSearchBoxState();
}

class _HomeSearchBoxState extends State<HomeSearchBox> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  final _link = LayerLink();
  final _portal = OverlayPortalController();
  final _fieldKey = GlobalKey();
  final _tapGroup = Object();
  Timer? _debounce;
  String _query = '';

  bool get _canShow => _query.length >= kTypeaheadMinChars;

  void _sync() {
    if (!mounted) return;
    if (_canShow && _focus.hasFocus) {
      _portal.show();
    } else {
      _portal.hide();
    }
  }

  void _onChanged(String text) {
    _debounce?.cancel();
    if (text.trim().length < kTypeaheadMinChars) {
      setState(() => _query = text.trim());
      _sync();
      return;
    }
    _debounce = Timer(widget.debounce, () {
      if (!mounted) return;
      setState(() => _query = text.trim());
      _sync();
    });
  }

  void _close() {
    _debounce?.cancel();
    _portal.hide();
    _focus.unfocus();
  }

  void _submit(String text) {
    final q = text.trim();
    if (q.isEmpty) return;
    _close();
    widget.onSubmitQuery(q);
  }

  void _openProduct(String id) {
    if (id.isEmpty) return;
    _close();
    widget.onOpenProduct(id);
  }

  void _useSuggestion(String name) {
    _controller.text = name;
    _controller.selection = TextSelection.collapsed(offset: name.length);
    _debounce?.cancel();
    setState(() => _query = name);
    _sync();
  }

  void _clear() {
    _debounce?.cancel();
    _controller.clear();
    setState(() => _query = '');
    _portal.hide();
  }

  @override
  void initState() {
    super.initState();
    _focus.addListener(_sync);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _focus.removeListener(_sync);
    _focus.dispose();
    _controller.dispose();
    super.dispose();
  }

  /// Room for the dropdown between the box and the keyboard.
  double _maxPanelHeight(BuildContext overlayContext) {
    final media = MediaQuery.of(overlayContext);
    final box = _fieldKey.currentContext?.findRenderObject() as RenderBox?;
    final bottom = box == null || !box.hasSize ? 120.0 : box.localToGlobal(Offset(0, box.size.height)).dy;
    final room = media.size.height - media.viewInsets.bottom - bottom - 16;
    return math.max(160, math.min(460, room));
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      return OverlayPortal(
        controller: _portal,
        overlayChildBuilder: (overlayContext) => Positioned(
          width: constraints.maxWidth,
          child: CompositedTransformFollower(
            link: _link,
            showWhenUnlinked: false,
            targetAnchor: Alignment.bottomLeft,
            offset: const Offset(0, 4),
            child: TapRegion(
              groupId: _tapGroup,
              child: TypeaheadPanel(
                query: _query,
                pincode: widget.pincode,
                maxHeight: _maxPanelHeight(overlayContext),
                onOpenProduct: _openProduct,
                onSeeAll: _submit,
                onSuggestion: _useSuggestion,
              ),
            ),
          ),
        ),
        child: CompositedTransformTarget(
          link: _link,
          child: TextField(
            key: _fieldKey,
            // Taps in the dropdown count as inside the box (Add keeps the keyboard and list)
            groupId: _tapGroup,
            onTapOutside: (_) {
              _portal.hide();
              _focus.unfocus();
            },
            controller: _controller,
            focusNode: _focus,
            textInputAction: TextInputAction.search,
            onChanged: _onChanged,
            onSubmitted: _submit,
            onTap: _sync,
            decoration: InputDecoration(
              hintText: SearchEntry.hint,
              filled: true,
              fillColor: Colors.white,
              prefixIcon: const Icon(Icons.search, color: AppTheme.brandGreen, size: 22),
              suffixIcon: ListenableBuilder(
                listenable: _controller,
                builder: (_, __) => _controller.text.isEmpty
                    ? const SizedBox.shrink()
                    : IconButton(tooltip: 'Clear search', icon: const Icon(Icons.clear, size: 18), onPressed: _clear),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppTheme.brandGreen100, width: 1.5),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppTheme.brandGreen, width: 1.5),
              ),
            ),
          ),
        ),
      );
    });
  }
}
