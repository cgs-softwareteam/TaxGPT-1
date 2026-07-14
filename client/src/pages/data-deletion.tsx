import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { Seo } from '@/components/Seo';

export default function DataDeletion() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/data-deletion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          reason: reason.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit deletion request');
      }

      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit deletion request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Seo
          title="Data Deletion Request | AITaxMD"
          description="Request permanent deletion of your AITaxMD account and personal data. GDPR/CCPA compliant."
          keywords="AITaxMD data deletion, delete my data, GDPR request, CCPA request, account deletion"
        />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-8">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Request Submitted Successfully</h1>
            <p className="text-gray-700 mb-6">
              Your data deletion request has been received. We will process your request within 30 days and send a confirmation email to {email}.
            </p>
            <p className="text-sm text-gray-600">
              If you have any questions, please contact us at privacy@aitaxmd.com
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title="Data Deletion Request | AITaxMD"
        description="Request permanent deletion of your AITaxMD account and personal data. GDPR/CCPA compliant."
        keywords="AITaxMD data deletion, delete my data, GDPR request, CCPA request, account deletion"
      />
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Delete Your Data</h1>
          <p className="text-gray-600 mt-2">Request permanent deletion of your account and personal data</p>
        </div>

        {/* Warning Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">Important Notice</h3>
              <p className="text-yellow-700 mb-3">
                Deleting your data is permanent and cannot be undone. This action will:
              </p>
              <ul className="list-disc list-inside text-yellow-700 space-y-1 text-sm">
                <li>Permanently delete your account and all associated data</li>
                <li>Remove all conversation history and chat interactions</li>
                <li>Delete any uploaded documents or tax information</li>
                <li>Revoke access to all TaxGPT services</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Deletion Request</h2>
            <p className="text-gray-700 leading-relaxed">
              We respect your right to control your personal data. If you wish to delete your account and all associated data from TaxGPT, please fill out the form below. We will process your request in accordance with applicable privacy laws.
            </p>
          </div>

          {/* What Gets Deleted */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">What Will Be Deleted</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center">
                  <Trash2 className="w-4 h-4 text-red-500 mr-2" />
                  <span className="text-gray-700">Account information</span>
                </div>
                <div className="flex items-center">
                  <Trash2 className="w-4 h-4 text-red-500 mr-2" />
                  <span className="text-gray-700">Conversation history</span>
                </div>
                <div className="flex items-center">
                  <Trash2 className="w-4 h-4 text-red-500 mr-2" />
                  <span className="text-gray-700">Uploaded documents</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center">
                  <Trash2 className="w-4 h-4 text-red-500 mr-2" />
                  <span className="text-gray-700">Personal preferences</span>
                </div>
                <div className="flex items-center">
                  <Trash2 className="w-4 h-4 text-red-500 mr-2" />
                  <span className="text-gray-700">Usage analytics</span>
                </div>
                <div className="flex items-center">
                  <Trash2 className="w-4 h-4 text-red-500 mr-2" />
                  <span className="text-gray-700">Authentication tokens</span>
                </div>
              </div>
            </div>
          </div>

          {/* Deletion Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter the email address associated with your account"
              />
              <p className="text-sm text-gray-600 mt-1">
                This must match the email address used to create your TaxGPT account.
              </p>
            </div>

            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Deletion (Optional)
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Please let us know why you're deleting your account (optional)"
              />
              <p className="text-sm text-gray-600 mt-1">
                Your feedback helps us improve our service for other users.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Processing Timeline</h4>
              <p className="text-sm text-gray-700">
                • We will acknowledge your request within 24 hours<br />
                • Data deletion will be completed within 30 days<br />
                • You will receive email confirmation once deletion is complete
              </p>
            </div>

            <div className="flex items-center space-x-4">
              <button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete My Data
                  </>
                )}
              </button>
              
              <Link href="/" className="text-gray-600 hover:text-gray-800">
                Cancel
              </Link>
            </div>
          </form>

          {/* Additional Information */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Need Help?</h3>
            <p className="text-gray-700 mb-4">
              If you have questions about data deletion or need assistance, please contact our privacy team:
            </p>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700">Email: privacy@aitaxmd.com</p>
              <p className="text-gray-700">Support: support@aitaxmd.com</p>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              You can also review our{' '}
              <Link href="/privacy-policy" className="text-blue-600 hover:text-blue-800 underline">
                Privacy Policy
              </Link>
              {' '}for more information about how we handle your data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}