import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, Building2, DollarSign } from 'lucide-react';

export default function PaymentsGuide() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-400" />
            Sentinel Forensics - Payments Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="text-slate-300 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Subscription Tiers</h2>
            <div className="overflow-x-auto">
              <table className="w-full border border-slate-700">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="border border-slate-700 px-4 py-2 text-left">Tier</th>
                    <th className="border border-slate-700 px-4 py-2 text-left">Price</th>
                    <th className="border border-slate-700 px-4 py-2 text-left">Features</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-700 px-4 py-2">Free</td>
                    <td className="border border-slate-700 px-4 py-2">$0/mo</td>
                    <td className="border border-slate-700 px-4 py-2">Basic forensics, evidence upload, case management</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-700 px-4 py-2">Professional</td>
                    <td className="border border-slate-700 px-4 py-2">$49/mo</td>
                    <td className="border border-slate-700 px-4 py-2">+ Pegasus Defense, Threat Hunting, 100 queries/mo</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-700 px-4 py-2">Enterprise</td>
                    <td className="border border-slate-700 px-4 py-2">$199/mo</td>
                    <td className="border border-slate-700 px-4 py-2">+ Unlimited queries, Priority support</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Payment Methods</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                  Credit/Debit Card (via Stripe)
                </h3>
                <p className="mb-3">Stripe provides secure, PCI-compliant card processing.</p>
                
                <div className="bg-slate-800 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Payment Flow:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>User clicks "Upgrade to Professional"</li>
                    <li>Frontend calls createCheckoutSession function</li>
                    <li>User redirected to Stripe Checkout page</li>
                    <li>After payment, redirect to /subscription/success</li>
                    <li>Webhook updates subscription tier</li>
                  </ol>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-400" />
                  ACH Bank Account (via Plaid)
                </h3>
                <p className="mb-3">Lower fees, secure bank transfers via Plaid Link.</p>
                
                <div className="bg-slate-800 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Payment Flow:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>User clicks "Link Bank Account (ACH)"</li>
                    <li>Plaid Link modal authenticates with bank</li>
                    <li>Public token exchanged for access token</li>
                    <li>Stripe bank account token created</li>
                    <li>Subscription charged via ACH (3-5 days)</li>
                  </ol>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Subscription Management</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Upgrading</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Navigate to /subscription</li>
                  <li>Select desired tier</li>
                  <li>Choose payment method (Card or ACH)</li>
                  <li>Complete payment flow</li>
                  <li>Tier updates immediately</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Cancelling</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Navigate to /subscription</li>
                  <li>Click "Cancel Subscription"</li>
                  <li>Confirm cancellation</li>
                  <li>Access remains until billing period ends</li>
                  <li>Downgraded to Free tier after expiration</li>
                </ol>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Security</h2>
            <div className="space-y-4">
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                <p className="font-semibold text-green-300 mb-2">PCI Compliance</p>
                <ul className="list-disc list-inside space-y-1 text-green-200">
                  <li>Card data never touches our servers</li>
                  <li>All card processing handled by Stripe</li>
                  <li>Stripe is PCI-DSS Level 1 certified</li>
                </ul>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                <p className="font-semibold text-blue-300 mb-2">Bank Account Security</p>
                <ul className="list-disc list-inside space-y-1 text-blue-200">
                  <li>Bank credentials never stored</li>
                  <li>Plaid handles all authentication</li>
                  <li>Account numbers tokenized via Stripe</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Testing</h2>
            <div className="bg-slate-800 rounded-lg p-4 space-y-3">
              <div>
                <p className="font-semibold text-white mb-1">Test Cards (Stripe):</p>
                <ul className="list-disc list-inside">
                  <li>Success: 4242 4242 4242 4242</li>
                  <li>Declined: 4000 0000 0000 0002</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">Test Bank Accounts (Plaid Sandbox):</p>
                <ul className="list-disc list-inside">
                  <li>Institution: Chase</li>
                  <li>Username: user_good</li>
                  <li>Password: pass_good</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Refund Policy</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>7-day money-back guarantee for first subscription</li>
              <li>Refunds processed within 5-10 business days</li>
              <li>Contact support@sentinelforensics.com for refunds</li>
            </ul>
          </section>

          <div className="mt-6 pt-6 border-t border-slate-700 text-sm text-slate-400">
            <p><strong>Billing Questions:</strong> billing@sentinelforensics.com</p>
            <p><strong>Technical Issues:</strong> support@sentinelforensics.com</p>
            <p><strong>Last Updated:</strong> January 2025</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}