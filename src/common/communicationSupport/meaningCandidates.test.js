import boards from '../../api/boards.json';
import messages from '../../translations/zh-CN.communication';
import { buildCommunicationTileCatalog, matchTextToCommunicationTiles } from './symbolMatching';
import { getLocalPictogramCandidates } from './pictogramSemantics';
import { analyzeCommunicationMatching, redactCommunicationMatchingDiagnostic } from './matchingDiagnostics';
const intl = { messages, formatMessage: ({ id }) => messages[id] || id };
const catalog = buildCommunicationTileCatalog(boards.advanced, intl);

test('rice is offered for broad meal wording without automatic equivalence', () => {
  expect(matchTextToCommunicationTiles('饭', boards.advanced, {intl}).matches[0].tile).toBeNull();
  expect(getLocalPictogramCandidates('饭', catalog)[0]).toMatchObject({ relation: 'narrower', item: { displayLabel: '米饭' } });
  expect(matchTextToCommunicationTiles('米饭', boards.advanced, {intl}).matches[0].tile.displayLabel).toBe('米饭');
});
test('general egg precedes boiled egg; heating and frying are source-qualified candidates', () => {
  expect(getLocalPictogramCandidates('鸡蛋', catalog).map(row => row.relation)).toEqual(['equivalent', 'narrower']);
  expect(getLocalPictogramCandidates('热一下', catalog)[0].sourceId).toBe('mulberry:heat_,_to.svg');
  expect(getLocalPictogramCandidates('炒', catalog)[0].sourceId).toBe('mulberry:stir_fry_,_to.svg');
  expect(getLocalPictogramCandidates('今晚', catalog)[0].relation).toBe('broader');
  expect(getLocalPictogramCandidates('要不要', catalog)).toEqual([]);
});
test('a private photo with a public label cannot enter the candidate list', () => {
  const rice = catalog.find(item => item.displayLabel === '米饭');
  expect(getLocalPictogramCandidates('饭', [{...rice, tile:{...rice.tile, personId:'synthetic'}}])).toEqual([]);
});

test('audited source identity survives translated labels, but a matching filename on an arbitrary host is insufficient', () => {
  const rice = catalog.find(item => item.displayLabel === '米饭');
  expect(getLocalPictogramCandidates('饭', [{...rice, displayLabel:'Rice'}])[0].item.displayLabel).toBe('米饭');
  expect(getLocalPictogramCandidates('饭', [{id:'untrusted', displayLabel:'米饭', tile:{image:'https://example.test/rice.svg'}}])).toEqual([]);
});
test('negative reheating does not receive a body-temperature picture', () => {
  const result = matchTextToCommunicationTiles('不要再热了', boards.advanced, {intl});
  expect(result.matches.some(item => item.tile && item.tile.id === 'SyS0fA96XqtW')).toBe(false);
  expect(result.matches.map(item => item.token).join('')).toBe('不要再热了');
});
test('diagnostics separate missing candidate from image availability and do not invent measured edits', () => {
  const report = analyzeCommunicationMatching('饭', boards.advanced, {intl});
  expect(report.items[0].diagnosticCategory).toBe('candidate-needs-review');
  expect(report.items[0].imageAvailability).toBe('not-applicable');
  expect(report.correctionCount).toBeNull();
  const safe = redactCommunicationMatchingDiagnostic({...report, inputText:'合成甲宁', items:[{...report.items[0], token:'合成甲宁', personalReference:true, image:'wxfile://private', pictogramId:'private-id'}]});
  expect(JSON.stringify(safe)).not.toMatch(/合成甲宁|wxfile|private-id/);
});
