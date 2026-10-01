import 'package:flutter/material.dart';
class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Admin panel')),
    body: const Center(child: Text('Use web dashboard for full admin', style: TextStyle(color: Colors.grey))),
  );
}
