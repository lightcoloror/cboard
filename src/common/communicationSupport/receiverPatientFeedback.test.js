import {
  MAX_RECEIVER_PATIENT_FEEDBACK_EVENTS,
  RECEIVER_PATIENT_FEEDBACK,
  appendReceiverPatientFeedback,
  getReceiverPatientFeedbackCaregiverNotice,
  getReceiverPatientFeedbackLabel,
  normalizeReceiverPatientFeedbackEvents
} from './receiverPatientFeedback';

const confirmedRecord = {
  id: 'receiver-1',
  direction: 'receive',
  recordStatus: 'confirmed',
  inputText: '请喝水',
  labels: ['喝', '水'],
  createdAt: 10,
  updatedAt: 20,
  confirmedAt: 20
};

describe('receiver patient feedback', () => {
  test('provides stable patient labels and caregiver notices', () => {
    expect(
      getReceiverPatientFeedbackLabel(RECEIVER_PATIENT_FEEDBACK.notUnderstood)
    ).toBe('没明白');
    expect(
      getReceiverPatientFeedbackCaregiverNotice(
        RECEIVER_PATIENT_FEEDBACK.notUnderstood
      )
    ).toContain('请修改文字、分词或图片');
    expect(
      getReceiverPatientFeedbackCaregiverNotice(
        RECEIVER_PATIENT_FEEDBACK.understood
      )
    ).toContain('可以开始下一句话');
    expect(
      getReceiverPatientFeedbackCaregiverNotice(
        RECEIVER_PATIENT_FEEDBACK.repeatRequested,
        { saved: false }
      )
    ).toContain('反馈未能保存');
    expect(getReceiverPatientFeedbackLabel('unknown')).toBe('');
  });

  test('appends feedback without changing the original confirmation time', () => {
    const updated = appendReceiverPatientFeedback(
      confirmedRecord,
      RECEIVER_PATIENT_FEEDBACK.repeatRequested,
      { now: () => 30 }
    );

    expect(updated).toEqual(
      expect.objectContaining({
        patientFeedback: 'repeat_requested',
        patientFeedbackAt: 30,
        patientFeedbackEvents: [{ type: 'repeat_requested', createdAt: 30 }],
        updatedAt: 30,
        confirmedAt: 20
      })
    );
  });

  test('keeps feedback timestamps monotonic and bounds the event trail', () => {
    const patientFeedbackEvents = Array.from(
      { length: MAX_RECEIVER_PATIENT_FEEDBACK_EVENTS },
      (value, index) => ({
        type: 'repeat_requested',
        createdAt: index + 1
      })
    );
    const updated = appendReceiverPatientFeedback(
      {
        ...confirmedRecord,
        updatedAt: 40,
        patientFeedbackEvents
      },
      RECEIVER_PATIENT_FEEDBACK.understood,
      { now: () => 30 }
    );

    expect(updated.patientFeedbackAt).toBe(41);
    expect(updated.patientFeedbackEvents).toHaveLength(
      MAX_RECEIVER_PATIENT_FEEDBACK_EVENTS
    );
    expect(updated.patientFeedbackEvents[0].createdAt).toBe(2);
    expect(updated.patientFeedbackEvents.at(-1)).toEqual({
      type: 'understood',
      createdAt: 41
    });
  });

  test('rejects drafts, expression records, and unknown feedback values', () => {
    expect(() =>
      appendReceiverPatientFeedback(
        { ...confirmedRecord, recordStatus: 'draft' },
        RECEIVER_PATIENT_FEEDBACK.understood
      )
    ).toThrow('confirmed receiver record');
    expect(() =>
      appendReceiverPatientFeedback(
        { ...confirmedRecord, direction: 'express' },
        RECEIVER_PATIENT_FEEDBACK.understood
      )
    ).toThrow('confirmed receiver record');
    expect(() =>
      appendReceiverPatientFeedback(confirmedRecord, 'maybe')
    ).toThrow('Unsupported patient feedback');
  });

  test('normalizes, sorts, and removes malformed feedback events', () => {
    expect(
      normalizeReceiverPatientFeedbackEvents([
        { type: 'understood', createdAt: 30.8 },
        { type: 'invalid', createdAt: 20 },
        { type: 'not_understood', createdAt: 10 },
        { type: 'repeat_requested', createdAt: 0 }
      ])
    ).toEqual([
      { type: 'not_understood', createdAt: 10 },
      { type: 'understood', createdAt: 30 }
    ]);
  });
});
