import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Simple tax report detection
export const isTaxReport = (content: string): boolean => {
  return content.includes('✅ **Scenario Title:**') || 
         content.includes('✅ Scenario Title:') ||
         content.includes('📌 **Key Strategies:**') ||
         content.includes('🛠 **Actionable Next Steps:**') ||
         content.includes('💰 **Estimated Potential Tax Savings:**');
};

// Safely escape HTML to prevent XSS
const escapeHtml = (unsafe: string): string => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Parse tax report content to extract structured data
const parseReport = (content: string) => {
  const lines = content.split('\n');
  const report: any = {
    scenarioTitle: '',
    primaryGoal: '',
    strategies: [],
    potentialSavings: '',
    newTotalTax: '',
    actionSteps: [],
    specialConsideration: '',
    finalReminder: ''
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.includes('✅ **Scenario Title:**')) {
      report.scenarioTitle = line.replace('✅ **Scenario Title:**', '').trim();
    } else if (line.includes('🎯 **Primary Goal:**')) {
      report.primaryGoal = line.replace('🎯 **Primary Goal:**', '').trim();
    } else if (line.includes('📌 **Key Strategies:**')) {
      // Parse strategies
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith('-')) {
        const strategy = lines[j].trim().replace(/^-\s*/, '');
        if (strategy.includes('**') && strategy.includes(':')) {
          const [name, description] = strategy.split(':');
          report.strategies.push({
            name: name.replace(/\*\*/g, '').trim(),
            description: description.trim()
          });
        }
        j++;
      }
    } else if (line.includes('💰 **Estimated Potential Tax Savings:**')) {
      report.potentialSavings = line.replace('💰 **Estimated Potential Tax Savings:**', '').trim();
    } else if (line.includes('🧮 **Estimated New Total Tax:**')) {
      report.newTotalTax = line.replace('🧮 **Estimated New Total Tax:**', '').trim();
    } else if (line.includes('🛠 **Actionable Next Steps:**')) {
      // Parse action steps
      let j = i + 1;
      while (j < lines.length && (lines[j].trim().match(/^\d+\./) || lines[j].trim().startsWith('-'))) {
        const step = lines[j].trim().replace(/^\d+\.\s*/, '').replace(/^-\s*/, '');
        if (step) {
          report.actionSteps.push(step);
        }
        j++;
      }
    } else if (line.includes('> 🔒 **Special Consideration:**')) {
      report.specialConsideration = line.replace('> 🔒 **Special Consideration:**', '').trim();
    } else if (line.includes('> ⚠️ **Final Reminder:**')) {
      report.finalReminder = line.replace('> ⚠️ **Final Reminder:**', '').trim();
    }
  }

  return report;
};

// Get detailed strategy content for PDF
const getDetailedStrategyContent = (strategyName: string) => {
  const lowerStrategyName = strategyName.toLowerCase();
  
  if (lowerStrategyName.includes('retirement') || lowerStrategyName.includes('ira') || lowerStrategyName.includes('401k')) {
    return {
      overview: "Maximize your retirement contributions to reduce current taxable income while building long-term wealth.",
      steps: [
        "Contribute maximum to employer 401(k) - up to $23,000 (2024 limit)",
        "Add catch-up contributions if 50+ - additional $7,500",
        "Open Traditional IRA for additional $7,000 deduction",
        "Consider Roth conversions during lower-income years"
      ],
      benefits: [
        "Immediate tax deduction on contributions",
        "Tax-deferred growth on investments",
        "Potential employer matching (free money)",
        "Builds retirement security"
      ],
      considerations: [
        "Funds locked until age 59½ (with exceptions)",
        "Required minimum distributions at 73",
        "Income limits may apply to IRA deductibility"
      ]
    };
  } else if (lowerStrategyName.includes('charitable') || lowerStrategyName.includes('donation')) {
    return {
      overview: "Strategic charitable giving can provide significant tax deductions while supporting causes you care about.",
      steps: [
        "Bunch donations in alternate years to exceed standard deduction",
        "Donate appreciated assets instead of cash",
        "Consider donor-advised funds for flexible timing",
        "Set up qualified charitable distribution from IRA if 70½+"
      ],
      benefits: [
        "Deduction up to 60% of AGI for cash donations",
        "Avoid capital gains on donated appreciated assets",
        "Support meaningful causes",
        "Potential estate tax benefits"
      ],
      considerations: [
        "Must itemize deductions to benefit",
        "Keep detailed records and receipts",
        "AGI limits may apply",
        "Ensure charity is qualified 501(c)(3)"
      ]
    };
  } else if (lowerStrategyName.includes('real estate') || lowerStrategyName.includes('property') || lowerStrategyName.includes('depreciation')) {
    return {
      overview: "Real estate investments offer unique tax advantages through depreciation, deductions, and potential 1031 exchanges.",
      steps: [
        "Document all rental property expenses",
        "Claim depreciation on investment properties",
        "Track improvement costs for basis adjustments",
        "Consider 1031 exchanges to defer capital gains"
      ],
      benefits: [
        "Depreciation reduces taxable rental income",
        "Deduct mortgage interest, repairs, management fees",
        "1031 exchanges defer capital gains taxes",
        "Potential for appreciation and cash flow"
      ],
      considerations: [
        "Depreciation recapture when selling",
        "Passive activity loss limitations",
        "Property management time and costs",
        "Market and liquidity risks"
      ]
    };
  } else {
    return {
      overview: "Tax-efficient investment strategies can minimize your tax burden while growing your wealth.",
      steps: [
        "Prioritize tax-advantaged accounts (401k, IRA, HSA)",
        "Use tax-loss harvesting in taxable accounts",
        "Hold investments over 1 year for long-term capital gains",
        "Consider municipal bonds if in high tax bracket"
      ],
      benefits: [
        "Lower long-term capital gains rates",
        "Tax-loss harvesting reduces current taxes",
        "Municipal bond interest often tax-free",
        "Compound growth in tax-deferred accounts"
      ],
      considerations: [
        "Wash sale rules apply to tax-loss harvesting",
        "State taxes may apply to municipal bonds",
        "Investment risks remain",
        "Rebalancing may trigger taxes"
      ]
    };
  }
};

// Get strategy metadata for display
const getStrategyMetadata = (strategyName: string, index: number) => {
  const strategies = [
    {
      keywords: ['retirement', 'ira', '401k', 'pension'],
      impactLevel: 'High',
      timeline: 'Immediate'
    },
    {
      keywords: ['charitable', 'donation', 'deduction'],
      impactLevel: 'Medium',
      timeline: 'Short-term'
    },
    {
      keywords: ['real estate', 'property', 'depreciation'],
      impactLevel: 'High',
      timeline: 'Long-term'
    },
    {
      keywords: ['investment', 'tax-efficient', 'capital'],
      impactLevel: 'Medium',
      timeline: 'Medium-term'
    }
  ];

  const lowerStrategyName = strategyName.toLowerCase();
  const matchedStrategy = strategies.find(s => 
    s.keywords.some(keyword => lowerStrategyName.includes(keyword))
  ) || strategies[index % strategies.length];

  return matchedStrategy;
};

// Client-side PDF export using browser's print functionality
const exportToPrint = (content: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Popup blocked - please allow popups for PDF export');
  }

  // Check if this is a tax report and parse accordingly
  const isTaxReportContent = isTaxReport(content);
  let htmlContent = '';

  if (isTaxReportContent) {
    // Parse structured tax report
    const report = parseReport(content);
    
    // Build enhanced HTML for tax reports with detailed strategies
    htmlContent = `
      <div class="report-header">
        <h2>${escapeHtml(report.scenarioTitle)}</h2>
        <p><strong>Goal:</strong> ${escapeHtml(report.primaryGoal)}</p>
      </div>
      
      <div class="financial-highlights">
        <div class="highlight-box">
          <h3>Potential Tax Savings</h3>
          <div class="amount">${escapeHtml(report.potentialSavings)}</div>
        </div>
        <div class="highlight-box">
          <h3>Estimated New Total Tax</h3>
          <div class="amount">${escapeHtml(report.newTotalTax)}</div>
        </div>
      </div>
      
      <div class="strategies-section">
        <h3>📌 Key Strategies</h3>
        ${report.strategies.map((strategy: any, index: number) => {
          const detailedContent = getDetailedStrategyContent(strategy.name);
          const metadata = getStrategyMetadata(strategy.name, index);
          
          return `
            <div class="strategy-card">
              <div class="strategy-header">
                <h4>${escapeHtml(strategy.name)}</h4>
                <div class="strategy-meta">
                  <span class="impact-${metadata.impactLevel.toLowerCase()}">${metadata.impactLevel} Impact</span>
                  <span class="timeline">${metadata.timeline}</span>
                </div>
              </div>
              <p class="strategy-description">${escapeHtml(strategy.description)}</p>
              
              <div class="strategy-details">
                <p class="overview"><strong>Overview:</strong> ${escapeHtml(detailedContent.overview)}</p>
                
                <div class="detail-section">
                  <h5>Implementation Steps:</h5>
                  <ol>
                    ${detailedContent.steps.map((step: string) => `<li>${escapeHtml(step)}</li>`).join('')}
                  </ol>
                </div>
                
                <div class="detail-section">
                  <h5>Benefits:</h5>
                  <ul>
                    ${detailedContent.benefits.map((benefit: string) => `<li>${escapeHtml(benefit)}</li>`).join('')}
                  </ul>
                </div>
                
                <div class="detail-section">
                  <h5>Important Considerations:</h5>
                  <ul>
                    ${detailedContent.considerations.map((consideration: string) => `<li>${escapeHtml(consideration)}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      ${report.actionSteps.length > 0 ? `
        <div class="action-steps">
          <h3>🛠 Actionable Next Steps</h3>
          <ol>
            ${report.actionSteps.map((step: string) => `<li>${escapeHtml(step)}</li>`).join('')}
          </ol>
        </div>
      ` : ''}
      
      ${report.specialConsideration ? `
        <div class="special-consideration">
          <h4>🔒 Special Consideration</h4>
          <p>${escapeHtml(report.specialConsideration)}</p>
        </div>
      ` : ''}
      
      ${report.finalReminder ? `
        <div class="final-reminder">
          <h4>⚠️ Final Reminder</h4>
          <p>${escapeHtml(report.finalReminder)}</p>
        </div>
      ` : ''}
    `;
  } else {
    // For non-tax reports, use basic markdown conversion
    const escapedContent = escapeHtml(content);
    htmlContent = escapedContent
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*)/gm, '• $1')
      .replace(/^\d+\. (.*)/gm, '<div style="margin-left: 20px;">$1</div>')
      .replace(/\n/g, '<br>');
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tax Planning Report</title>
      <style>
        @media print {
          body { margin: 0; padding: 20px; }
          .no-print { display: none; }
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1, h2, h3, h4, h5 { color: #2563eb; margin-top: 20px; margin-bottom: 10px; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.3em; }
        h4 { font-size: 1.1em; }
        h5 { font-size: 1em; }
        strong { color: #1f2937; }
        .header {
          text-align: center;
          border-bottom: 3px solid #2563eb;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .content {
          white-space: pre-line;
        }
        
        /* Enhanced styles for tax reports */
        .report-header {
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 25px;
          border-left: 4px solid #2563eb;
        }
        .report-header h2 {
          margin: 0 0 10px 0;
          color: #1e40af;
        }
        
        .financial-highlights {
          display: flex;
          gap: 20px;
          margin-bottom: 30px;
        }
        .highlight-box {
          flex: 1;
          background: #f0f9ff;
          border: 2px solid #0ea5e9;
          border-radius: 10px;
          padding: 15px;
          text-align: center;
        }
        .highlight-box h3 {
          margin: 0 0 10px 0;
          color: #0c4a6e;
          font-size: 0.9em;
        }
        .amount {
          font-size: 1.8em;
          font-weight: bold;
          color: #0c4a6e;
        }
        
        .strategies-section {
          margin-bottom: 30px;
        }
        .strategy-card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .strategy-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          border-bottom: 1px solid #f3f4f6;
          padding-bottom: 10px;
        }
        .strategy-header h4 {
          margin: 0;
          color: #1f2937;
        }
        .strategy-meta {
          display: flex;
          gap: 10px;
          font-size: 0.8em;
        }
        .impact-high {
          background: #dcfce7;
          color: #166534;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 500;
        }
        .impact-medium {
          background: #fef3c7;
          color: #92400e;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 500;
        }
        .timeline {
          color: #6b7280;
          font-weight: 500;
        }
        .strategy-description {
          color: #6b7280;
          margin-bottom: 15px;
          font-style: italic;
        }
        .strategy-details {
          background: #f9fafb;
          padding: 15px;
          border-radius: 8px;
        }
        .overview {
          margin-bottom: 15px;
          padding: 10px;
          background: #eff6ff;
          border-radius: 6px;
          border-left: 3px solid #3b82f6;
        }
        .detail-section {
          margin-bottom: 15px;
        }
        .detail-section h5 {
          margin: 0 0 8px 0;
          color: #374151;
          font-size: 0.95em;
        }
        .detail-section ul, .detail-section ol {
          margin: 0;
          padding-left: 20px;
        }
        .detail-section li {
          margin-bottom: 5px;
          color: #4b5563;
        }
        
        .action-steps {
          background: #f0f9ff;
          border: 1px solid #0ea5e9;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .action-steps h3 {
          margin-top: 0;
          color: #0c4a6e;
        }
        .action-steps ol {
          margin: 0;
          padding-left: 20px;
        }
        .action-steps li {
          margin-bottom: 8px;
          color: #374151;
        }
        
        .special-consideration, .final-reminder {
          background: #fef2f2;
          border: 1px solid #f87171;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 15px;
        }
        .special-consideration h4, .final-reminder h4 {
          margin-top: 0;
          color: #dc2626;
        }
        .special-consideration p, .final-reminder p {
          margin-bottom: 0;
          color: #7f1d1d;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Tax Planning Report</h1>
        <p>Generated by AITaxMD • ${new Date().toLocaleDateString()}</p>
      </div>
      <div class="content">${htmlContent}</div>
      <div class="no-print" style="margin-top: 30px; text-align: center;">
        <p><small>Use Ctrl+P or Cmd+P to print, or use your browser's File → Print menu</small></p>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  
  // Auto-trigger print dialog after a short delay
  setTimeout(() => {
    printWindow.print();
  }, 500);
};

interface UsePdfExportOptions {
  messageId?: number;
  content: string;
  showToast?: boolean;
}

export const usePdfExport = ({ messageId, content, showToast = true }: UsePdfExportOptions) => {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      // If no messageId, use simple client-side export
      if (!messageId) {
        exportToPrint(content);
        return { success: true, type: 'client' };
      }
      
      // Try server-based export first
      try {
        const response = await fetch(`/api/export/pdf/message/${messageId}`, {
          method: "POST",
          credentials: "include",
        });
        
        if (!response.ok) {
          // If server fails, fallback to client-side export
          console.warn('Server PDF export failed, falling back to client-side export');
          exportToPrint(content);
          return { success: true, type: 'client' };
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tax-plan-${messageId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        return { success: true, type: 'server', blob };
      } catch (error) {
        // Fallback to client-side export on any error
        console.warn('Server PDF export error, falling back to client-side export:', error);
        exportToPrint(content);
        return { success: true, type: 'client' };
      }
    },
    onSuccess: (result) => {
      if (!showToast) return;
      
      toast({
        title: result?.type === 'server' ? "PDF Downloaded" : "Print Dialog Opened",
        description: result?.type === 'server' ? 
          "Your tax plan has been exported as PDF." : 
          "Use your browser's print dialog to save as PDF.",
      });
    },
    onError: (error) => {
      if (!showToast) return;
      
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Could not export PDF. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    exportPdf: mutation.mutate,
    isExporting: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  };
};