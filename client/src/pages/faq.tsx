import { Link } from "wouter";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { Seo } from "@/components/Seo";
import {
  FAQS,
  makeWebPage,
  makeBreadcrumb,
  makeFaqPage,
} from "@/lib/schema";

/**
 * FAQ page. The visible content mirrors the FAQS list exactly, which is
 * what feeds the FAQPage schema — this satisfies Google's requirement
 * that FAQ schema only be emitted when the same content is on the page.
 */
export default function FAQPageRoute() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title="Frequently Asked Questions | AITaxMD"
        description="Common questions about AITaxMD — how the AI tax planning assistant works, pricing, data privacy, and what to expect from your personalized tax plan."
        keywords="AITaxMD FAQ, AI tax questions, tax planning FAQ, tax assistant help"
        schema={[
          makeWebPage({
            name: "Frequently Asked Questions",
            description:
              "Common questions about AITaxMD's AI-powered tax planning assistant.",
            url: "/faq",
          }),
          makeBreadcrumb([
            { name: "Home", url: "/" },
            { name: "FAQ", url: "/faq" },
          ]),
          makeFaqPage(FAQS),
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <HelpCircle className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">
              Frequently Asked Questions
            </h1>
          </div>
          <p className="text-gray-600 mt-2 ml-14">
            Common questions about AITaxMD.
          </p>
        </div>

        {/* FAQ list — <details>/<summary> gives a clean collapsible with
            zero JS, and content inside is fully indexable by Google. */}
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <details
              key={i}
              className="group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
              data-testid={`faq-item-${i}`}
            >
              <summary className="cursor-pointer p-5 font-semibold text-gray-900 flex items-center justify-between hover:bg-gray-50 transition-colors list-none">
                <span>{faq.question}</span>
                <svg
                  className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180 shrink-0 ml-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-gray-700 leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>

        {/* CTA back to the app */}
        <div className="mt-10 bg-white rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-gray-700 mb-3">
            Ready to see how much you could save?
          </p>
          <Link href="/">
            <button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-md transition-colors"
            >
              Get your personalized tax plan
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
