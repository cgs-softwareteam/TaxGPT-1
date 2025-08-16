import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { 
  Download, 
  Mail, 
  Copy, 
  FileText,
  Share2,
  Check,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ExportButtonsProps {
  messageId: number;
  content: string;
  className?: string;
}

export function ExportButtons({ messageId, content, className }: ExportButtonsProps) {
  const [emailData, setEmailData] = useState({ email: "", note: "" });
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/export/pdf/message/${messageId}`, {
        method: "POST",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to export PDF");
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
      
      return blob;
    },
    onSuccess: () => {
      toast({
        title: "PDF Downloaded",
        description: "Your tax plan has been exported as PDF.",
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "Could not export PDF. Please try again.",
        variant: "destructive",
      });
    },
  });

  const shareEmailMutation = useMutation({
    mutationFn: async (data: { recipientEmail: string; senderNote: string }) => {
      return apiRequest("/api/share/email", {
        method: "POST",
        body: {
          messageId,
          recipientEmail: data.recipientEmail,
          senderNote: data.senderNote,
        },
      });
    },
    onSuccess: () => {
      setIsEmailDialogOpen(false);
      setEmailData({ email: "", note: "" });
      toast({
        title: "Email Sent",
        description: "Tax plan has been shared via email.",
      });
    },
    onError: () => {
      toast({
        title: "Share Failed",
        description: "Could not send email. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        title: "Copied to Clipboard",
        description: "Tax plan content has been copied.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleEmailShare = () => {
    if (!emailData.email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter a recipient email address.",
        variant: "destructive",
      });
      return;
    }

    shareEmailMutation.mutate({
      recipientEmail: emailData.email,
      senderNote: emailData.note,
    });
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      {/* Copy to Clipboard */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyToClipboard}
        disabled={copied}
        data-testid={`copy-button-${messageId}`}
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 mr-2" />
            Copied
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 mr-2" />
            Copy
          </>
        )}
      </Button>

      {/* Export PDF */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => exportPdfMutation.mutate()}
        disabled={exportPdfMutation.isPending}
        data-testid={`pdf-button-${messageId}`}
      >
        {exportPdfMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-2" />
            PDF
          </>
        )}
      </Button>

      {/* Share via Email */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid={`email-button-${messageId}`}
          >
            <Mail className="w-4 h-4 mr-2" />
            Email
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Tax Plan via Email</DialogTitle>
            <DialogDescription>
              Send this tax planning strategy to someone via email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Recipient Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="recipient@example.com"
                value={emailData.email}
                onChange={(e) => setEmailData(prev => ({ ...prev, email: e.target.value }))}
                data-testid="email-input"
              />
            </div>
            <div>
              <Label htmlFor="note">Personal Note (Optional)</Label>
              <Textarea
                id="note"
                placeholder="Add a personal message..."
                value={emailData.note}
                onChange={(e) => setEmailData(prev => ({ ...prev, note: e.target.value }))}
                rows={3}
                data-testid="note-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEmailDialogOpen(false)}
              data-testid="cancel-email"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEmailShare}
              disabled={shareEmailMutation.isPending}
              data-testid="send-email"
            >
              {shareEmailMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}