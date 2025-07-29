import ReactMarkdown from "react-markdown";
import { DollarSign, Target, Lightbulb, CheckCircle, Shield, AlertTriangle, PiggyBank, Building2, Receipt, TrendingUp, Clock, Zap, Calendar } from "lucide-react";

interface StructuredReportRendererProps {
  content: string;
  timestamp: Date;
}

export default function StructuredReportRenderer({ content, timestamp }: StructuredReportRendererProps) {
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.strategies.map((strategy: any, index: number) => {
              const { icon, impactLevel, timeline, impactColor, timelineIcon } = getStrategyMetadata(strategy.name, index);
              
              return (
                <div key={index} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-lg transition-all duration-200 hover:border-gray-300">
                  {/* Strategy Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="bg-blue-50 p-2 rounded-lg">
                        {icon}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">{strategy.name}</h4>
                        <p className="text-xs text-gray-500 mt-1">{strategy.description}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Strategy Metadata */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${impactColor}`}>
                        {impactLevel} Impact
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 text-xs text-gray-500">
                      {timelineIcon}
                      <span>{timeline}</span>
                    </div>
                  </div>
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