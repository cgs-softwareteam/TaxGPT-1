import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { DollarSign, Target, Lightbulb, CheckCircle, Shield, AlertTriangle, PiggyBank, Building2, Receipt, TrendingUp, Clock, Zap, Calendar, ChevronDown, ChevronRight, Info, Sparkles } from "lucide-react";

interface StructuredReportRendererProps {
  content: string;
  timestamp: Date;
}

export default function StructuredReportRenderer({ content, timestamp }: StructuredReportRendererProps) {
  const [expandedStrategy, setExpandedStrategy] = useState<number | null>(null);
  const [loadingDetailedExplanation, setLoadingDetailedExplanation] = useState<number | null>(null);
  const [detailedExplanations, setDetailedExplanations] = useState<{[key: number]: string}>({});

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Get strategy metadata based on strategy name and index
  const getStrategyMetadata = (strategyName: string, index: number) => {
    const strategies = [
      {
        keywords: ['retirement', 'ira', '401k', 'pension'],
        icon: <PiggyBank className="w-4 h-4 text-blue-600" />,
        impactLevel: 'High',
        timeline: 'Immediate',
        impactColor: 'bg-green-100 text-green-700',
        timelineIcon: <Zap className="w-3 h-3" />
      },
      {
        keywords: ['charitable', 'donation', 'deduction'],
        icon: <Receipt className="w-4 h-4 text-purple-600" />,
        impactLevel: 'Medium',
        timeline: 'Short-term',
        impactColor: 'bg-yellow-100 text-yellow-700',
        timelineIcon: <Clock className="w-3 h-3" />
      },
      {
        keywords: ['real estate', 'property', 'depreciation'],
        icon: <Building2 className="w-4 h-4 text-orange-600" />,
        impactLevel: 'High',
        timeline: 'Long-term',
        impactColor: 'bg-green-100 text-green-700',
        timelineIcon: <Calendar className="w-3 h-3" />
      },
      {
        keywords: ['investment', 'tax-efficient', 'capital'],
        icon: <TrendingUp className="w-4 h-4 text-green-600" />,
        impactLevel: 'Medium',
        timeline: 'Medium-term',
        impactColor: 'bg-yellow-100 text-yellow-700',
        timelineIcon: <Clock className="w-3 h-3" />
      }
    ];

    // Match strategy by keywords or use index-based fallback
    const lowerStrategyName = strategyName.toLowerCase();
    const matchedStrategy = strategies.find(s => 
      s.keywords.some(keyword => lowerStrategyName.includes(keyword))
    ) || strategies[index % strategies.length];

    return matchedStrategy;
  };

  // Get detailed strategy content when clicked
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

  // Generate detailed AI explanation for a strategy
  const generateDetailedExplanation = async (strategyName: string, strategyIndex: number) => {
    setLoadingDetailedExplanation(strategyIndex);
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Please provide a comprehensive, expert-level explanation of the "${strategyName}" tax strategy. Include specific examples, advanced techniques, potential pitfalls, and detailed implementation guidance. Make this a thorough analysis that a tax professional would provide.`
            }
          ]
        })
      });

      const data = await response.json();
      
      setDetailedExplanations(prev => ({
        ...prev,
        [strategyIndex]: data.content
      }));
    } catch (error) {
      console.error('Error generating detailed explanation:', error);
      setDetailedExplanations(prev => ({
        ...prev,
        [strategyIndex]: 'Unable to generate detailed explanation at this time. Please try again later.'
      }));
    } finally {
      setLoadingDetailedExplanation(null);
    }
  };

  // Parse the structured content
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

  const report = parseReport(content);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md p-1 max-w-full md:max-w-4xl shadow-sm">
      {/* Header */}
      <div className="flex items-center space-x-2 mb-4 px-4 pt-4">
        <div className="bg-primary text-white p-2 rounded-full">
          <Target className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium text-gray-700">TaxGPT</span>
        <span className="text-xs bg-green-600 text-white px-3 py-1 rounded-full">Tax Report Generated</span>
      </div>

      <div className="px-4 pb-4 space-y-6">
        {/* Scenario Title & Primary Goal */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            {report.scenarioTitle}
          </h2>
          <p className="text-gray-700 flex items-center">
            <Target className="w-4 h-4 text-blue-600 mr-2" />
            <strong>Goal:</strong> {report.primaryGoal}
          </p>
        </div>

        {/* Financial Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 font-medium">Potential Tax Savings</p>
                <p className="text-2xl font-bold text-green-800">{report.potentialSavings}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 font-medium">Estimated New Total Tax</p>
                <p className="text-2xl font-bold text-blue-800">{report.newTotalTax}</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Key Strategies as Enhanced Cards */}
        <div>
          <h3 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
            <Lightbulb className="w-5 h-5 text-yellow-600 mr-2" />
            Key Strategies
          </h3>
          <div className="space-y-4">
            {report.strategies.map((strategy: any, index: number) => {
              const { icon, impactLevel, timeline, impactColor, timelineIcon } = getStrategyMetadata(strategy.name, index);
              const isExpanded = expandedStrategy === index;
              const detailedContent = getDetailedStrategyContent(strategy.name);
              
              return (
                <div key={index} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200">
                  {/* Clickable Strategy Header */}
                  <div 
                    className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedStrategy(isExpanded ? null : index)}
                    data-testid={`strategy-card-${index}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-50 p-2 rounded-lg">
                          {icon}
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 text-sm">{strategy.name}</h4>
                          <p className="text-xs text-gray-500 mt-1">{strategy.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${impactColor}`}>
                            {impactLevel} Impact
                          </span>
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            {timelineIcon}
                            <span>{timeline}</span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Detailed Content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50">
                      <div className="pt-4 space-y-4">
                        {/* Overview */}
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2 flex-1">
                              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <h5 className="font-medium text-blue-900 text-sm mb-1">Overview</h5>
                                <p className="text-xs text-blue-800">{detailedContent.overview}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => generateDetailedExplanation(strategy.name, index)}
                              disabled={loadingDetailedExplanation === index}
                              className="ml-3 flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid={`detailed-explanation-${index}`}
                            >
                              {loadingDetailedExplanation === index ? (
                                <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full"></div>
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              <span>{loadingDetailedExplanation === index ? 'Generating...' : 'Get Expert Analysis'}</span>
                            </button>
                          </div>
                          
                          {/* Detailed AI Explanation */}
                          {detailedExplanations[index] && (
                            <div className="mt-4 pt-4 border-t border-blue-200">
                              <h6 className="font-medium text-blue-900 text-sm mb-2 flex items-center">
                                <Sparkles className="w-3 h-3 mr-1" />
                                Expert Analysis
                              </h6>
                              <div className="bg-white rounded-lg p-3 border border-blue-200">
                                <div className="prose prose-xs max-w-none">
                                  <ReactMarkdown
                                    components={{
                                      p: ({ children }) => <p className="text-xs text-gray-700 leading-relaxed mb-2 last:mb-0">{children}</p>,
                                      strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                                      ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
                                      ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
                                      li: ({ children }) => <li className="text-xs text-gray-600">{children}</li>
                                    }}
                                  >
                                    {detailedExplanations[index]}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Implementation Steps */}
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <h5 className="font-medium text-gray-900 text-sm mb-3 flex items-center">
                              <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                              Implementation Steps
                            </h5>
                            <ul className="space-y-2">
                              {detailedContent.steps.map((step: string, stepIndex: number) => (
                                <li key={stepIndex} className="text-xs text-gray-700 flex items-start">
                                  <span className="flex-shrink-0 w-4 h-4 bg-green-100 text-green-700 rounded-full text-xs flex items-center justify-center mr-2 mt-0.5 font-medium">
                                    {stepIndex + 1}
                                  </span>
                                  {step}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Benefits */}
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <h5 className="font-medium text-gray-900 text-sm mb-3 flex items-center">
                              <TrendingUp className="w-4 h-4 text-green-600 mr-2" />
                              Key Benefits
                            </h5>
                            <ul className="space-y-2">
                              {detailedContent.benefits.map((benefit: string, benefitIndex: number) => (
                                <li key={benefitIndex} className="text-xs text-gray-700 flex items-start">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                                  {benefit}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Considerations */}
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <h5 className="font-medium text-gray-900 text-sm mb-3 flex items-center">
                              <AlertTriangle className="w-4 h-4 text-amber-600 mr-2" />
                              Important Considerations
                            </h5>
                            <ul className="space-y-2">
                              {detailedContent.considerations.map((consideration: string, considerationIndex: number) => (
                                <li key={considerationIndex} className="text-xs text-gray-700 flex items-start">
                                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                                  {consideration}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Steps */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <h3 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
            <CheckCircle className="w-5 h-5 text-blue-600 mr-2" />
            Actionable Next Steps
          </h3>
          <div className="space-y-2">
            {report.actionSteps.map((step: string, index: number) => (
              <div key={index} className="flex items-start space-x-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-medium">
                  {index + 1}
                </span>
                <p className="text-sm text-gray-700">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Special Consideration */}
        {report.specialConsideration && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-800 mb-1">Special Consideration</h4>
                <p className="text-sm text-amber-700">{report.specialConsideration}</p>
              </div>
            </div>
          </div>
        )}

        {/* Final Reminder */}
        {report.finalReminder && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800 mb-1">Important Reminder</h4>
                <p className="text-sm text-red-700">{report.finalReminder}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="text-xs text-gray-500 px-4 pb-4">{formatTime(timestamp)}</div>
    </div>
  );
}