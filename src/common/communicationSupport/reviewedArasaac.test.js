import reviewedArasaac from './picinterpreterReviewedArasaac.json';
import {
  getReviewedArasaacIds,
  getReviewedArasaacIndexSummary,
  getReviewedArasaacSegmentationRewrite,
  getReviewedArasaacSegmentationTerms
} from './reviewedArasaac';

describe('PicInterpreter reviewed ARASAAC index', () => {
  test('keeps the shared client index traceable to the reviewed source', () => {
    expect(getReviewedArasaacIndexSummary()).toEqual({
      schemaVersion: 1,
      sourceSha256:
        'E37C92F3E198DBBFBD03DDFBCE800883529B3BFC704A2D143FE28C774FAF5D9A',
      caseCount: 41,
      conceptCount: 138,
      aliasCount: 21
    });
  });

  test('resolves every narrow alias to an existing reviewed concept', () => {
    Object.entries(reviewedArasaac.aliases).forEach(([alias, concept]) => {
      expect(reviewedArasaac.concepts).toHaveProperty(concept);
      expect(getReviewedArasaacIds(alias)).toEqual(
        reviewedArasaac.concepts[concept]
      );
    });
  });

  test('keeps ambiguous or medically broad words outside reviewed aliases', () => {
    ['受伤了', '抬', '叫', '体温', '呼吸困难', '按铃'].forEach(token => {
      expect(getReviewedArasaacIds(token)).toEqual([]);
    });
  });

  test('exposes reviewed multi-character concepts as stable segmentation terms', () => {
    const terms = getReviewedArasaacSegmentationTerms();

    expect(terms).toHaveLength(154);
    expect(terms).toEqual(
      expect.arrayContaining([
        '测体温',
        '床头柜',
        '降低音量',
        '叫门',
        '胸口痛',
        '开窗通风',
        '涂药膏',
        '抬肘咳嗽',
        '一会儿',
        '声音大',
        '天气晴朗',
        '有人叫门',
        '平静地',
        '杯子里的水',
        '冰箱里的鸡汤还有一点',
        '吃药时间到了',
        '换干净的尿布',
        '用纸巾遮住嘴',
        '或者抬肘咳嗽',
        '我叫护士',
        '坐轮椅下楼散步',
        '医生下午三点来看你',
        '呼吸困难',
        '走一点路',
        '听安静的音乐'
      ])
    );
    expect(terms.indexOf('抬肘咳嗽')).toBeLessThan(terms.indexOf('咳嗽'));
  });

  test('rewrites only reviewed multi-concept phrases', () => {
    expect(getReviewedArasaacSegmentationRewrite('拿给')).toEqual(['拿', '给']);
    expect(getReviewedArasaacSegmentationRewrite('呼吸困难')).toEqual([
      '呼吸',
      '困难的'
    ]);
    expect(getReviewedArasaacSegmentationRewrite('走一点路')).toEqual([
      '走路',
      '少许'
    ]);
    expect(getReviewedArasaacSegmentationRewrite('吃药时间到了')).toEqual([
      '时间',
      '药'
    ]);
    expect(getReviewedArasaacSegmentationRewrite('用纸巾遮住嘴')).toEqual([
      '纸巾',
      '嘴'
    ]);
    expect(getReviewedArasaacSegmentationRewrite('或者抬肘咳嗽')).toEqual([
      '抬肘咳嗽'
    ]);
    expect(getReviewedArasaacSegmentationRewrite('我叫护士')).toEqual([
      '我',
      '说',
      '护士'
    ]);
    expect(getReviewedArasaacSegmentationRewrite('坐轮椅下楼散步')).toEqual([
      '轮椅',
      '电梯',
      '下',
      '散步'
    ]);
    expect(getReviewedArasaacSegmentationRewrite('医生下午三点来看你')).toEqual(
      ['医生', '下午', '三点整', '来', '你']
    );
    ['先喝水', '叫护士', '下楼', '来看你'].forEach(token => {
      expect(getReviewedArasaacSegmentationRewrite(token)).toBeNull();
    });
    expect(getReviewedArasaacSegmentationRewrite('按铃动作')).toBeNull();
  });
});
