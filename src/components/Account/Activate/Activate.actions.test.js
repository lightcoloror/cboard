import axios from 'axios';
import { activate } from './Activate.actions';

jest.mock('axios', () => ({ post: jest.fn() }));
afterEach(() => jest.resetAllMocks());

test.each([1, true])(
  'accepts explicit activation success %s',
  async success => {
    axios.post.mockResolvedValue({ data: { success, userid: 'synthetic' } });
    expect(await activate('synthetic-token')).toEqual({
      success: true,
      userid: 'synthetic'
    });
  }
);

test.each([
  undefined,
  null,
  {},
  { success: 0 },
  { success: false },
  { success: 'true' }
])(
  'does not turn an unsuccessful response into activation success: %s',
  async data => {
    axios.post.mockResolvedValue({ data });
    expect((await activate('synthetic-token')).success).toBe(false);
  }
);

test.each([
  new Error('network'),
  { response: { data: { success: true, message: 'rejected' } } }
])('returns a safe failure result for rejected requests', async error => {
  axios.post.mockRejectedValue(error);
  expect((await activate('synthetic-token')).success).toBe(false);
});
