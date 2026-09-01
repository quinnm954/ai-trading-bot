import { Scale, FileText, AlertTriangle, Mail } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export function LegalAndPrivacy() {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Legal Information</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Please review our policies and disclosures below. By using TitanAI, you agree to these terms.
        </p>

        <Accordion type="single" collapsible className="w-full space-y-2">
          {/* Privacy Policy */}
          <AccordionItem value="privacy" className="border border-border rounded-lg bg-secondary/30 px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span className="font-medium">Privacy Policy</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-4 pb-4">
              <p className="font-medium text-foreground">Last Updated: December 16, 2025</p>
              
              <section>
                <h4 className="font-semibold text-foreground mb-2">1. Information We Collect</h4>
                <p>We collect information you provide directly to us, including:</p>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                  <li>Account information (email address, password)</li>
                  <li>Trading preferences and settings</li>
                  <li>API credentials for connected brokers (encrypted)</li>
                  <li>Trading activity and performance data</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">2. How We Use Your Information</h4>
                <p>We use the information we collect to:</p>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                  <li>Provide, maintain, and improve our services</li>
                  <li>Execute trades on your behalf through connected brokers</li>
                  <li>Send you technical notices and support messages</li>
                  <li>Respond to your comments and questions</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">3. Data Security</h4>
                <p>We implement industry-standard security measures including:</p>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                  <li>AES-256 encryption for API credentials</li>
                  <li>Secure HTTPS connections for all data transfers</li>
                  <li>Regular security audits and updates</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">4. Data Sharing</h4>
                <p>We do not sell, trade, or rent your personal information to third parties. We may share information only:</p>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                  <li>With your consent</li>
                  <li>To comply with legal obligations</li>
                  <li>To protect our rights and prevent fraud</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">5. Your Rights</h4>
                <p>You have the right to:</p>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                  <li>Access your personal data</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Export your data</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">6. Contact Us</h4>
                <p>For privacy-related inquiries, contact us at: <a href="mailto:capitalservicesmanagementinc@outlook.com" className="text-primary hover:underline">capitalservicesmanagementinc@outlook.com</a></p>
              </section>
            </AccordionContent>
          </AccordionItem>

          {/* Terms of Service */}
          <AccordionItem value="terms" className="border border-border rounded-lg bg-secondary/30 px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span className="font-medium">Terms of Service</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-4 pb-4">
              <p className="font-medium text-foreground">Last Updated: December 16, 2025</p>
              
              <section>
                <h4 className="font-semibold text-foreground mb-2">1. Acceptance of Terms</h4>
                <p>By accessing or using TitanAI ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">2. Description of Service</h4>
                <p>TitanAI is an AI-powered trading assistant tool that connects to your personal brokerage accounts to analyze markets and execute trades based on your configured preferences and risk parameters.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">3. User Responsibilities</h4>
                <p>You are responsible for:</p>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                  <li>Maintaining the security of your account credentials</li>
                  <li>All trading activity conducted through your account</li>
                  <li>Ensuring compliance with applicable laws and regulations</li>
                  <li>Understanding the risks associated with trading</li>
                  <li>Configuring appropriate risk management settings</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">4. No Custody of Funds</h4>
                <p>TitanAI does not hold, control, or have custody of your funds. All funds remain in your personal brokerage accounts. We only connect to your accounts via API to execute trades on your behalf.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">5. No Investment Advice</h4>
                <p>The Service does not provide investment advice, financial advice, trading advice, or any other sort of advice. You should consult a qualified financial advisor before making any investment decisions.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">6. Limitation of Liability</h4>
                <p>To the maximum extent permitted by law, TitanAI and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or other intangible losses resulting from your use of the Service.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">7. Modifications to Service</h4>
                <p>We reserve the right to modify or discontinue the Service at any time without notice. We shall not be liable to you or any third party for any modification, suspension, or discontinuance of the Service.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">8. Governing Law</h4>
                <p>These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.</p>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">9. Contact</h4>
                <p>For questions about these Terms, contact us at: <a href="mailto:capitalservicesmanagementinc@outlook.com" className="text-primary hover:underline">capitalservicesmanagementinc@outlook.com</a></p>
              </section>
            </AccordionContent>
          </AccordionItem>

          {/* Risk Disclosure */}
          <AccordionItem value="risk" className="border border-border rounded-lg bg-secondary/30 px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="font-medium">Risk Disclosure</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-4 pb-4">
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning">
                <p className="font-semibold">⚠️ Important Risk Warning</p>
                <p className="mt-1">Trading cryptocurrencies involves substantial risk of loss and is not suitable for all investors.</p>
              </div>
              
              <section>
                <h4 className="font-semibold text-foreground mb-2">1. Trading Risks</h4>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>You may lose some or all of your invested capital</li>
                  <li>Past performance is not indicative of future results</li>
                  <li>Cryptocurrency markets are highly volatile and can move rapidly</li>
                  <li>Automated trading systems can malfunction or produce unexpected results</li>
                  <li>Market conditions can change rapidly, affecting trading strategies</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">2. No Guarantees</h4>
                <p>TitanAI does not guarantee any profits or returns. The AI trading system attempts to maximize profit within defined risk constraints, but:</p>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                  <li>No trading strategy guarantees profits</li>
                  <li>Historical backtesting results do not guarantee future performance</li>
                  <li>AI predictions and analysis may be incorrect</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">3. Technology Risks</h4>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>System outages may prevent trade execution</li>
                  <li>Internet connectivity issues may affect performance</li>
                  <li>Exchange or broker API issues may cause delays or failures</li>
                  <li>Software bugs may result in unintended trading behavior</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">4. Regulatory Risks</h4>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>Cryptocurrency regulations vary by jurisdiction and may change</li>
                  <li>You are responsible for compliance with local laws and regulations</li>
                  <li>Tax obligations related to trading are your responsibility</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-foreground mb-2">5. Recommendation</h4>
                <p>Before using TitanAI:</p>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                  <li>Only invest money you can afford to lose</li>
                  <li>Start with paper trading to understand the system</li>
                  <li>Set conservative risk limits initially</li>
                  <li>Regularly monitor your positions and account</li>
                  <li>Consult a financial advisor if unsure</li>
                </ul>
              </section>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Contact Information */}
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Contact Us</h3>
        </div>
        
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-sm text-muted-foreground mb-3">
            For support, questions, or concerns, please reach out to us:
          </p>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <a 
              href="mailto:capitalservicesmanagementinc@outlook.com" 
              className="text-primary hover:underline font-medium"
            >
              capitalservicesmanagementinc@outlook.com
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            We typically respond within 24-48 business hours.
          </p>
        </div>

        <div className="mt-4 p-4 rounded-lg bg-secondary/30">
          <p className="text-sm font-medium text-foreground mb-2">Company Information</p>
          <p className="text-sm text-muted-foreground">
            Capital Services Management Inc.
          </p>
        </div>
      </div>
    </div>
  );
}
