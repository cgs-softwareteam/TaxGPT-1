import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Star, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SaveButtonProps {
  messageId: number;
  content: string;
  className?: string;
}

export function SaveButton({ messageId, content, className }: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const savePlanMutation = useMutation({
    mutationFn: async (data: { messageId: number; title: string; tags?: string[] }) => {
      return apiRequest("POST", "/api/saved-plans", data);
    },
    onSuccess: () => {
      setIsSaved(true);
      queryClient.invalidateQueries({ queryKey: ["/api/saved-plans"] });
      toast({
        title: "Plan Saved",
        description: "Tax plan has been saved to your collection.",
      });
      
      // Reset the saved state after 3 seconds
      setTimeout(() => setIsSaved(false), 3000);
    },
    onError: (error) => {
      toast({
        title: "Failed to Save",
        description: "Could not save the plan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const extractTitleFromContent = (content: string): string => {
    // Look for scenario title or first line as title
    const lines = content.split('\n').filter(line => line.trim());
    const scenarioMatch = content.match(/Scenario Title:\*\*\s*(.+)/);
    
    if (scenarioMatch) {
      return scenarioMatch[1].trim();
    }
    
    // Use first meaningful line as title
    const firstLine = lines[0]?.replace(/[#*✅🎯📌💰🧮🛠]/g, '').trim();
    return firstLine || 'Tax Planning Strategy';
  };

  const extractTagsFromContent = (content: string): string[] => {
    const tags: string[] = [];
    
    // Extract strategy names
    const strategyMatches = content.match(/\*\*([^:*]+):\*\*\s*([^.]+)/g);
    if (strategyMatches) {
      strategyMatches.forEach(match => {
        const strategyName = match.split(':')[0].replace(/\*/g, '').trim();
        if (strategyName && strategyName.length < 50) {
          tags.push(strategyName);
        }
      });
    }
    
    // Add content-based tags
    if (content.toLowerCase().includes('retirement')) tags.push('Retirement');
    if (content.toLowerCase().includes('deduction')) tags.push('Deductions');
    if (content.toLowerCase().includes('business')) tags.push('Business');
    if (content.toLowerCase().includes('investment')) tags.push('Investment');
    
    return Array.from(new Set(tags)); // Remove duplicates
  };

  const handleSave = () => {
    if (savePlanMutation.isPending || isSaved) return;

    const title = extractTitleFromContent(content);
    const tags = extractTagsFromContent(content);

    savePlanMutation.mutate({
      messageId,
      title,
      tags,
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSave}
      disabled={savePlanMutation.isPending || isSaved}
      className={`transition-all duration-200 ${className} ${
        isSaved 
          ? 'bg-green-50 border-green-200 text-green-700' 
          : 'hover:bg-yellow-50 hover:border-yellow-200'
      }`}
      data-testid={`save-button-${messageId}`}
    >
      {isSaved ? (
        <>
          <Check className="w-4 h-4 mr-2" />
          Saved
        </>
      ) : (
        <>
          <Star className="w-4 h-4 mr-2" />
          {savePlanMutation.isPending ? 'Saving...' : 'Save Plan'}
        </>
      )}
    </Button>
  );
}