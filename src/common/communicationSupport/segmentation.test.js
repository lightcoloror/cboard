import {
  formatCommunicationSegmentation,
  parseCommunicationSegmentationInput,
  segmentChineseCommunicationText
} from './segmentation';

describe('Chinese communication segmentation', () => {
  function withoutIntlSegmenter(run) {
    const segmenterDescriptor = Object.getOwnPropertyDescriptor(
      Intl,
      'Segmenter'
    );

    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      value: undefined
    });

    try {
      return run();
    } finally {
      if (segmenterDescriptor) {
        Object.defineProperty(Intl, 'Segmenter', segmenterDescriptor);
      } else {
        delete Intl.Segmenter;
      }
    }
  }
  test.each([
    ['想吃苹果', ['想', '吃']],
    ['要吃苹果', ['要', '吃']],
    ['要喝牛奶', ['要', '喝']]
  ])('splits modal and action words in %s', (input, expectedWords) => {
    const result = segmentChineseCommunicationText(input);

    expectedWords.forEach(word => {
      expect(result.segments).toContain(word);
    });
  });

  test.each([['想喝水', ['想', '喝', '水']], ['想饮水', ['想', '饮', '水']]])(
    'keeps the action and object separate in %s',
    (input, expected) => {
      expect(segmentChineseCommunicationText(input).segments).toEqual(expected);
    }
  );

  test('keeps care terms intact without Intl.Segmenter', () => {
    withoutIntlSegmenter(() => {
      expect(segmentChineseCommunicationText('需要休息').segments).toEqual([
        '需要',
        '休息'
      ]);
    });
  });

  const receiverCases = [
    ['我想吃苹果', ['我', '想', '吃', '苹果']],
    ['我想喝牛奶', ['我', '想', '喝', '牛奶']],
    ['我不开心', ['我', '不开心']],
    ['我要上厕所', ['我', '要', '上厕所']],
    ['我肚子疼', ['我', '肚子疼']],
    ['你肚子不舒服吗', ['你', '肚子', '不舒服']],
    ['我头晕', ['我', '头晕']],
    ['你现在痛不痛', ['你', '现在', '痛', '不', '痛']],
    ['痛是一点点还是很痛', ['痛', '是', '一点点', '还是', '很痛']],
    ['你冷不冷', ['你', '冷', '不冷']],
    ['你热不热', ['你', '热', '不热']],
    ['我帮你叫护士', ['我', '帮你', '叫', '护士']],
    ['现在要换尿片', ['现在', '要', '换', '尿片']],
    ['衣服湿了要换衣服', ['衣服', '湿', '要', '换', '衣服']],
    ['被子要不要盖上', ['被子', '要不要', '盖上']],
    ['枕头高一点', ['枕头', '高', '一点']],
    ['灯关掉好不好', ['灯', '关掉', '好不好']],
    ['要坐车还是走路', ['要', '坐车', '还是', '走路']],
    ['爸爸等一下来看你', ['爸爸', '等一下', '来', '看你']],
    ['要不要给家里人发消息', ['要不要', '给', '家人', '发消息']],
    ['要不要画画', ['要不要', '画画']],
    ['我想打电话', ['我', '想', '打电话']],
    ['我需要休息', ['我', '需要', '休息']],
    ['医生下午三点来看你', ['医生', '下午', '三点整', '来', '你']],
    ['我叫护士', ['我', '说', '护士']],
    ['坐轮椅下楼散步', ['轮椅', '电梯', '下', '散步']],
    ['或者抬肘咳嗽', ['抬肘咳嗽']],
    ['开心果', ['开心果']],
    ['苹果手机', ['苹果手机']]
  ];

  const migratedSpokenAliasCases = [
    ['我精力不足', ['我', '精力不足']],
    ['我体温高', ['我', '体温高']],
    ['我老是咳嗽', ['我', '老是咳嗽']],
    ['我头昏脑涨', ['我', '头昏脑涨']],
    ['我干呕', ['我', '干呕']],
    ['我呼吸不顺', ['我', '呼吸不顺']],
    ['我在出血', ['我', '在出血']],
    ['我要换件衣服', ['我', '要', '换件衣服']],
    ['我想看个电视', ['我', '想', '看个电视']],
    ['我想看一本书', ['我', '想', '看一本书']]
  ];

  test.each(receiverCases)(
    'protects receiver semantics in %s',
    (input, expected) => {
      expect(segmentChineseCommunicationText(input).segments).toEqual(expected);
    }
  );

  test.each(receiverCases)(
    'protects receiver semantics without Intl.Segmenter in %s',
    (input, expected) => {
      withoutIntlSegmenter(() => {
        expect(segmentChineseCommunicationText(input).segments).toEqual(
          expected
        );
      });
    }
  );
  test.each(['不要', '不想', '不去', '不吃', '不喝'])(
    'keeps the negated concept %s intact when Intl supports it',
    input => {
      const result = segmentChineseCommunicationText(input);

      if (result.engine === 'intl-segmenter') {
        expect(result.segments).toContain(input);
      }
    }
  );

  test.each(migratedSpokenAliasCases)(
    'preserves the migrated spoken alias in %s',
    (input, expected) => {
      expect(segmentChineseCommunicationText(input).segments).toEqual(expected);
    }
  );

  test.each(migratedSpokenAliasCases)(
    'preserves the migrated spoken alias without Intl.Segmenter in %s',
    (input, expected) => {
      withoutIntlSegmenter(() => {
        expect(segmentChineseCommunicationText(input).segments).toEqual(
          expected
        );
      });
    }
  );

  test('round-trips caregiver-edited segmentation text', () => {
    const tokens = parseCommunicationSegmentationInput('我想 / 喝，水、现在');

    expect(tokens).toEqual(['我想', '喝', '水', '现在']);
    expect(formatCommunicationSegmentation(tokens)).toBe(
      '我想 / 喝 / 水 / 现在'
    );
  });

  test.each([
    ['你发烧，我协助你测体温。', '测体温'],
    ['眼镜在床头柜上面。', '床头柜'],
    ['电视声音大，我降低音量。', '降低音量'],
    ['有人叫门，我去开门。', '有人叫门'],
    ['胸口痛，马上按红色按钮。', '胸口痛'],
    ['我开窗通风十分钟。', '开窗通风'],
    ['我帮助你涂药膏。', '涂药膏'],
    ['用纸巾遮住嘴，或者抬肘咳嗽。', '抬肘咳嗽']
  ])('protects reviewed PicInterpreter concept in %s', (input, concept) => {
    expect(segmentChineseCommunicationText(input).segments).toContain(concept);
  });

  test.each([
    ['我们去阳台坐一会儿。', ['一会儿']],
    ['晚上九点，我们睡觉。', ['九点']],
    ['医生下午三点来看你。', ['三点整']],
    ['电视声音大，我降低音量。', ['声音大']],
    ['天气晴朗，我们坐轮椅下楼散步。', ['天气晴朗']],
    ['有人叫门，我去开门。', ['有人叫门']],
    ['眼镜在床头柜上面，我拿给你。', ['拿', '给']],
    ['你呼吸困难，马上告诉我。', ['呼吸', '困难的']],
    ['现在康复，抬手，然后走一点路。', ['抬起', '手', '走路', '少许']],
    ['出门前，我拿钥匙上锁。', ['出去', '之前']],
    ['有事告诉我。', ['说', '我']],
    ['你想听安静的音乐吗？', ['听音乐', '安静的']]
  ])('keeps reviewed scenario phrase boundaries in %s', (input, concepts) => {
    expect(segmentChineseCommunicationText(input).segments).toEqual(
      expect.arrayContaining(concepts)
    );
  });

  test.each([
    ['杯子里的水，温度好。', ['杯子', '水']],
    ['现在第一步吃药。', ['第一']],
    ['冰箱里的鸡汤还有一点。', ['冰箱', '鸡汤', '少许']],
    ['太阳出来了。', ['太阳']],
    ['我帮助你换干净的尿布。', ['换尿布', '干净的', '尿布']],
    ['我帮助你洗澡，然后用毛巾擦干。', ['毛巾', '擦干']],
    ['汤烫，用勺子慢慢喝。', ['勺子']],
    ['我们用手机打电话给妈妈。', ['手机', '打电话']],
    ['吃药时间到了，先喝水。', ['时间', '药']],
    ['咳嗽，用纸巾遮住嘴。', ['纸巾', '嘴']],
    ['地面有水，小心走路。', ['地面', '水']]
  ])('reuses reviewed sequence fragments in %s', (input, concepts) => {
    expect(segmentChineseCommunicationText(input).segments).toEqual(
      expect.arrayContaining(concepts)
    );
  });

  test('keeps the reviewed adverb phrase natural while enabling lookup', () => {
    expect(
      segmentChineseCommunicationText('你平静地睡觉。').segments
    ).toContain('平静地');
  });
});
