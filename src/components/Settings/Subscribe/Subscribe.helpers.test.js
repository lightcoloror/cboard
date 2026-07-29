import {
  buildPaypalSubscriptionPayload,
  buildSubscriberProduct
} from './Subscribe.helpers';

describe('subscription payload helpers', () => {
  const product = {
    id: 'yearly-plan',
    subscriptionId: 'premium',
    title: 'Premium (Cboard AAC)',
    billingPeriod: 'P1Y',
    price: { currencyCode: 'USD', units: 60 },
    tag: 'yearly',
    paypalId: 'P-PAYPAL'
  };

  test('keeps server-verifiable catalog identifiers in the subscriber product', () => {
    expect(buildSubscriberProduct(product)).toEqual({
      title: 'Premium ',
      billingPeriod: 'P1Y',
      price: { currencyCode: 'USD', units: 60 },
      tag: 'yearly',
      subscriptionId: 'premium',
      planId: 'yearly-plan',
      paypalId: 'P-PAYPAL'
    });
  });

  test('binds a PayPal subscription to the authenticated CBoard account', () => {
    expect(buildPaypalSubscriptionPayload(product, 'user-1')).toEqual({
      plan_id: 'P-PAYPAL',
      custom_id: 'user-1'
    });
  });
});
