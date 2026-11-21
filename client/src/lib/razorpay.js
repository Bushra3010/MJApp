// Razorpay Standard Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/)
import { api } from './api.js';

let loading;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => { loading = null; reject(new Error('Could not load the payment page. Check your connection.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Resolves with the new coin balance, or null if the user closed the payment window. */
export async function buyPack(packId) {
  const order = await api('/wallet/order', { method: 'POST', body: { packId } });
  if (order.mode === 'test') return order.coins;
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      image: `${location.origin}/icon-192.png`,
      prefill: order.prefill,
      theme: { color: '#F41470' },
      handler: (resp) => api('/wallet/verify', { method: 'POST', body: resp }).then((r) => resolve(r.coins)).catch(reject),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r.error?.description || 'Payment failed')));
    rzp.open();
  });
}
