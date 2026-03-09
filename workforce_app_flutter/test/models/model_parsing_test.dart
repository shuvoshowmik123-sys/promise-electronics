import 'package:flutter_test/flutter_test.dart';
import 'package:promise_mobile_command/features/jobs/models/job_model.dart';
import 'package:promise_mobile_command/shared/models/bootstrap_model.dart';

void main() {
  group('Model Parsing Tests', () {
    test('JobModel.fromJson handles missing fields gracefully', () {
      final json = {
        'id': '123',
        'device': 'Samsung S22',
        // 'customer' omitted
        'issueDescription': 'Broken Screen',
      };

      final job = JobModel.fromJson(json);

      expect(job.id, '123');
      expect(job.deviceName, 'Samsung S22');
      expect(job.customerName, 'Unknown Customer'); 
      expect(job.issueDescription, 'Broken Screen');
      expect(job.status, 'Pending'); // default
      expect(job.priority, 'Normal'); // default
      expect(job.notes, isEmpty);
    });

    test('JobModel.fromJson parses nested notes', () {
      final json = {
        'id': '124',
        'status': 'In Progress',
        'priority': 'Urgent',
        'notes': [
          {
            'id': 'n1',
            'text': 'Needs new motherboard',
            'authorName': 'John Tech',
            'createdAt': '2023-10-25T10:00:00Z'
          }
        ]
      };

      final job = JobModel.fromJson(json);

      expect(job.notes.length, 1);
      expect(job.notes.first.text, 'Needs new motherboard');
      expect(job.notes.first.authorName, 'John Tech');
    });

    test('BootstrapModel.fromJson parses core analytics and unread counts', () {
      final json = {
        'user': {'id': 1, 'name': 'Admin', 'role': 'SUPER_ADMIN'},
        'modules': ['jobs', 'attendance'],
        'unreadCounts': {
          'notifications': 5,
        },
        'homeSummary': {
          'counters': {
            'jobs': 10,
            'urgentJobs': 42
          }
        }
      };

      final bootstrap = BootstrapModel.fromJson(json);
      
      expect(bootstrap.unreadCounts.notifications, 5);
      expect(bootstrap.homeSummary.counters.jobs, 10);
      expect(bootstrap.homeSummary.counters.urgentJobs, 42);
    });
  });
}
