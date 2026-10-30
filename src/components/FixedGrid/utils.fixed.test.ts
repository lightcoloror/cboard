import { getFixedGridPages, sortGrid } from './utils';

test('fixed rendering retains a 2x3 layout and puts unpositioned cards on a separate page', () => {
  const order = [['a',null,'b'],[null,'c',null]];
  const items = ['a','b','c','new'].map(id=>({id}));
  const pages = getFixedGridPages(items, order, 6);
  expect(pages.map(page=>page.map(item=>item.id))).toEqual([['a','b','c'],['new']]);
  const grid = sortGrid({rows:2,columns:3,order,items:pages[0],preserveEmptySlots:true});
  expect(grid.map(row=>row.map(item=>item?.id || null))).toEqual(order);
  expect(sortGrid({rows:2,columns:3,order,items,preserveEmptySlots:true}).flat().filter(Boolean).map(item=>item.id)).toEqual(['a','b','c']);
});
