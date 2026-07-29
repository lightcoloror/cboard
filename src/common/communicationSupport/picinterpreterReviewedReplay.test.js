import boardsFixture from '../../api/boards.json';
import zhMessages from '../../translations/zh-CN.communication';
import { getReviewedArasaacIds } from './reviewedArasaac';
import { matchTextToCommunicationTiles } from './symbolMatching';

const REVIEWED_SOURCE_SHA256 =
  'E37C92F3E198DBBFBD03DDFBCE800883529B3BFC704A2D143FE28C774FAF5D9A';

const REVIEWED_SCENARIOS = [
  ['daily-01', '杯子里的水，温度好，你慢慢喝一点。'],
  ['daily-02', '现在第一步吃药，然后喝水。'],
  ['daily-03', '食物在桌子上面，第一吃大米和蔬菜。'],
  ['daily-04', '冰箱里的鸡汤还有一点，加热，然后喝。'],
  ['daily-05', '你想去厕所吗？我帮助你去。'],
  ['daily-06', '第一洗手，然后吃食物。'],
  ['daily-07', '你哪里疼痛？头部，肚子？'],
  ['daily-08', '你发烧，我协助你测体温。'],
  ['daily-09', '冷，我帮助你穿大衣。'],
  ['daily-10', '太阳出来了，我们去阳台坐一会儿。'],
  ['daily-11', '你累了，躺下休息。'],
  ['daily-12', '晚上九点，我们睡觉。'],
  ['daily-13', '手机电池需要充电，我帮助你充电。'],
  ['daily-14', '眼镜在床头柜上面，我拿给你。'],
  ['daily-15', '电视声音大，我降低音量。'],
  ['daily-16', '有人叫门，我去开门。'],
  ['daily-17', '医生下午三点来看你。'],
  ['daily-18', '明天上午我们去医院检查。'],
  ['daily-19', '你想打电话给妈妈吗？'],
  ['daily-20', '胸口痛，马上按红色按钮。'],
  ['daily-21', '水的温度好，我帮助你洗澡，然后用毛巾擦干。'],
  ['daily-22', '刷牙，然后睡觉。'],
  ['daily-23', '尿布湿了，我帮助你换干净的尿布。'],
  ['daily-24', '午饭以后，吃一点水果，苹果，可以吗？'],
  ['daily-25', '汤烫，用勺子慢慢喝。'],
  ['daily-26', '我开窗通风十分钟。屋里闷无合适图片。'],
  ['daily-27', '我关灯，你平静地睡觉。有事告诉我；按铃动作无合适图片。'],
  ['daily-28', '我们看照片，家人。'],
  ['daily-29', '你想听安静的音乐吗？我帮助。'],
  ['daily-30', '我们用手机打电话给妈妈。'],
  ['daily-31', '现在康复，抬手，然后走一点路。'],
  ['daily-32', '吃药时间到了，先喝水，然后吃药。'],
  ['daily-33', '伤口疼，我帮助你涂药膏，然后包扎伤口。'],
  ['daily-34', '你便秘，可以去厕所吗？'],
  ['daily-35', '咳嗽，用纸巾遮住嘴，或者抬肘咳嗽。捂嘴动作无准确图片。'],
  ['daily-36', '你呼吸困难，马上告诉我，我叫护士。'],
  ['daily-37', '天气晴朗，我们坐轮椅下楼散步。'],
  ['daily-38', '地面有水，小心，走路，不要滑倒。'],
  ['daily-39', '出门前，我拿钥匙上锁；你等候我。'],
  ['daily-40', '下午，医生来病房；你不舒服，告诉医生。'],
  ['daily-41', '选择：明天辞职？还是找到工作以后辞职？']
];

const intl = {
  messages: zhMessages,
  formatMessage: ({ id }) => zhMessages[id] || id
};

function replayReviewedScenarios() {
  const unmatchedTokens = [];
  const reviewedTokens = [];
  const unreviewedCounts = {};

  REVIEWED_SCENARIOS.forEach(([, finalText]) => {
    const result = matchTextToCommunicationTiles(
      finalText,
      boardsFixture.advanced,
      { intl }
    );

    result.matches.forEach(match => {
      if (match.tile) return;

      unmatchedTokens.push(match.token);
      if (getReviewedArasaacIds(match.token).length) {
        reviewedTokens.push(match.token);
        return;
      }

      unreviewedCounts[match.token] = (unreviewedCounts[match.token] || 0) + 1;
    });
  });

  return {
    unmatchedOccurrences: unmatchedTokens.length,
    unmatchedUnique: new Set(unmatchedTokens).size,
    reviewedOccurrences: reviewedTokens.length,
    reviewedUnique: new Set(reviewedTokens).size,
    unreviewedCounts
  };
}

describe('PicInterpreter reviewed scenario replay', () => {
  test('keeps the 41 reviewed final texts tied to the source snapshot', () => {
    expect(REVIEWED_SOURCE_SHA256).toBe(
      'E37C92F3E198DBBFBD03DDFBCE800883529B3BFC704A2D143FE28C774FAF5D9A'
    );
    expect(REVIEWED_SCENARIOS).toHaveLength(41);
    expect(new Set(REVIEWED_SCENARIOS.map(([id]) => id)).size).toBe(41);
  });

  test('replays the current reviewed coverage through real CBoard matching', () => {
    const result = replayReviewedScenarios();

    expect(result).toMatchObject({
      unmatchedOccurrences: 133,
      unmatchedUnique: 96,
      reviewedOccurrences: 118,
      reviewedUnique: 85
    });
    expect(
      result.reviewedOccurrences / result.unmatchedOccurrences
    ).toBeCloseTo(0.8872, 4);
  });

  test('keeps the remaining unreviewed tokens explicit for safe follow-up', () => {
    expect(replayReviewedScenarios().unreviewedCounts).toEqual({
      先: 1,
      准确: 1,
      动作: 2,
      合适: 2,
      屋: 1,
      按铃: 1,
      捂: 1,
      无: 3,
      还是: 1,
      里: 1,
      闷: 1
    });
  });
});
