export const formatDuration = iso => {
  if (!iso) return '';
  const l = iso.length;
  const n = iso.slice(1, l - 1);
  if (n === '1') {
    return (
      { D: 'Day', W: 'Week', M: 'Month', Y: 'Year' }[iso[l - 1]] || iso[l - 1]
    );
  } else {
    const u =
      { D: 'Days', W: 'Weeks', M: 'Months', Y: 'Years' }[iso[l - 1]] ||
      iso[l - 1];
    return `${n} ${u}`;
  }
};

export const formatTitle = title => {
  if (!title) return '';
  return title.replace('(Cboard AAC)', '');
};

export const buildSubscriberProduct = product => ({
  title: formatTitle(product.title),
  billingPeriod: product.billingPeriod,
  price: product.price,
  tag: product.tag,
  subscriptionId: product.subscriptionId,
  planId: product.id || product.planId,
  paypalId: product.paypalId
});

export const buildPaypalSubscriptionPayload = (product, userId) => ({
  plan_id: product.paypalId,
  custom_id: userId
});
