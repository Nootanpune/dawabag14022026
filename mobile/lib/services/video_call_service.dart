import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

import '../models/consultation.dart';
import 'api_service.dart';
import 'consultation_api.dart';

/// Where the call stands, shown on the call screen.
enum CallPhase { connecting, waiting, connected, reconnecting, ended, error }

/// One teleconsultation call over the Agora RTC engine (Mobile Sprint 14).
///
/// C-23 (teleconsultation privacy): the call is only between the patient and
/// the consultation's doctor. The server issues a token bound to this channel
/// and this one user account ([ConsultJoin.uid]); the app never builds a token.
/// Nothing is recorded — no local or cloud recording is ever started.
/// Standing rule: nothing about the call is written to the device; the join
/// details live in memory for as long as the call screen is open.
class VideoCallService extends ChangeNotifier {
  VideoCallService({required this.consultationId, required this.join}) : camOn = join.mode == 'video';

  final String consultationId;
  final ConsultJoin join;

  RtcEngine? _engine;
  bool _disposed = false;
  bool _released = false;

  CallPhase phase = CallPhase.connecting;

  /// An error or a passing notice (the other person left, the time is nearly over).
  String? message;

  /// True when the camera/microphone permission was refused for good, so the
  /// screen can offer the system settings.
  bool permissionBlocked = false;

  /// Agora uid of the other person once they are in the channel.
  int? remoteUid;
  bool micOn = true;
  bool camOn;

  bool get withVideo => join.mode == 'video';
  RtcEngine? get engine => _engine;
  bool get isOver => phase == CallPhase.ended || phase == CallPhase.error;
  String get otherPerson => join.role == 'doctor' ? 'the patient' : 'the doctor';

  /// A real call needs audio/video, an app id and a server-issued token.
  static bool canCall(ConsultJoin j) =>
      j.mode != 'text' && j.hasToken && (j.appId ?? '').isNotEmpty && (j.uid ?? '').isNotEmpty;

  /// Asks for the camera/microphone, starts the engine and joins the channel
  /// with the user account the token was issued for.
  Future<void> start() async {
    if (!canCall(join)) {
      _fail('The video service is not set up yet, so the call cannot start. Please contact support.');
      return;
    }
    final wanted = [Permission.microphone, if (withVideo) Permission.camera];
    final statuses = await wanted.request();
    if (_released) return;
    if (statuses.values.any((s) => !s.isGranted)) {
      permissionBlocked = statuses.values.any((s) => s.isPermanentlyDenied || s.isRestricted);
      _fail(withVideo
          ? 'Camera and microphone access is needed for a video consultation.'
          : 'Microphone access is needed for an audio consultation.');
      return;
    }

    try {
      final engine = createAgoraRtcEngine();
      _engine = engine;
      await engine.initialize(RtcEngineContext(
        appId: join.appId,
        channelProfile: ChannelProfileType.channelProfileCommunication,
      ));
      engine.registerEventHandler(_handler());
      if (withVideo) {
        await engine.enableVideo();
        await engine.startPreview();
      } else {
        await engine.disableVideo();
      }
      if (_released) return;
      await engine.joinChannelWithUserAccount(
        token: join.token!,
        channelId: join.channel,
        userAccount: join.uid!,
        options: ChannelMediaOptions(
          channelProfile: ChannelProfileType.channelProfileCommunication,
          clientRoleType: ClientRoleType.clientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: withVideo,
          autoSubscribeAudio: true,
          autoSubscribeVideo: withVideo,
        ),
      );
    } catch (e) {
      debugPrint('Video call failed to start: $e');
      _fail('The call could not be connected. Check your connection and join again.');
    }
  }

  RtcEngineEventHandler _handler() => RtcEngineEventHandler(
        onJoinChannelSuccess: (connection, elapsed) {
          if (remoteUid == null) _set(CallPhase.waiting);
        },
        onUserJoined: (connection, uid, elapsed) {
          remoteUid = uid;
          message = null;
          _set(CallPhase.connected);
        },
        onUserOffline: (connection, uid, reason) {
          if (uid != remoteUid) return;
          remoteUid = null;
          message = '${_capital(otherPerson)} left the call.';
          _set(CallPhase.waiting);
        },
        onConnectionStateChanged: (connection, state, reason) {
          if (state == ConnectionStateType.connectionStateReconnecting) {
            _set(CallPhase.reconnecting);
          } else if (state == ConnectionStateType.connectionStateConnected && phase == CallPhase.reconnecting) {
            _set(remoteUid == null ? CallPhase.waiting : CallPhase.connected);
          } else if (state == ConnectionStateType.connectionStateFailed) {
            _fail('The call connection was refused. Close and join again from your consultations.');
          }
        },
        // The token lives until an hour after the slot ends; before it lapses,
        // ask the server for a fresh one (same channel, same account).
        onTokenPrivilegeWillExpire: (connection, token) => _renewToken(),
        onRequestToken: (connection) {
          message = "The consultation's call time is over.";
          _set(CallPhase.ended);
          _release();
        },
        onError: (err, msg) => debugPrint('Agora error $err: $msg'),
      );

  Future<void> _renewToken() async {
    try {
      final fresh = await apiService.joinConsultation(consultationId);
      final token = fresh.token;
      if (token == null || token.isEmpty) throw StateError('no token');
      await _engine?.renewToken(token);
    } catch (_) {
      message = "This consultation's time is nearly over; the call will end shortly.";
      _notify();
    }
  }

  Future<void> toggleMic() async {
    final engine = _engine;
    if (engine == null) return;
    await engine.muteLocalAudioStream(micOn);
    micOn = !micOn;
    _notify();
  }

  /// Turning the camera off stops capture itself, not just the picture sent.
  Future<void> toggleCam() async {
    final engine = _engine;
    if (engine == null || !withVideo) return;
    await engine.enableLocalVideo(!camOn);
    camOn = !camOn;
    _notify();
  }

  Future<void> leave() async {
    await _release();
    message = null;
    _set(CallPhase.ended);
  }

  /// Leaves the channel and frees the engine (camera and microphone). Safe to call twice.
  Future<void> _release() async {
    if (_released) return;
    _released = true;
    final engine = _engine;
    _engine = null;
    remoteUid = null;
    if (engine == null) return;
    try {
      if (withVideo) await engine.stopPreview();
      await engine.leaveChannel();
      await engine.release();
    } catch (e) {
      debugPrint('Video call release failed: $e');
    }
  }

  void _fail(String text) {
    message = text;
    _set(CallPhase.error);
    _release();
  }

  void _set(CallPhase next) {
    phase = next;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  static String _capital(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  @override
  void dispose() {
    _disposed = true;
    _release();
    super.dispose();
  }
}
