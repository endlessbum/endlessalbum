import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, Gamepad2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { subscribeWs } from "@/lib/ws";
import type { GameType } from "@shared/ws-messages";

interface GameInvitation {
  id: string;
  gameType: GameType;
  gameTitle: string;
  inviterName: string;
  inviterId: string;
  message: string;
  timestamp: string;
}

interface GameInvitationNotificationProps {
  onAcceptInvitation: (gameType: GameType) => void;
}

export default function GameInvitationNotification({ 
  onAcceptInvitation 
}: GameInvitationNotificationProps) {
  const [invitations, setInvitations] = useState<GameInvitation[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'game_invitation') {
          const invitation: GameInvitation = {
            id: `${data.inviterId}-${data.gameType}-${Date.now()}`,
            gameType: data.gameType,
            gameTitle: data.gameTitle,
            inviterName: data.inviterName,
            inviterId: data.inviterId,
            message: data.message,
            timestamp: data.timestamp
          };

          setInvitations(prev => [...prev, invitation]);

          toast({
            title: "Приглашение в игру!",
            description: data.message,
            duration: 6000,
          });

          setTimeout(() => {
            setInvitations(prev => prev.filter(inv => inv.id !== invitation.id));
          }, 30000);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    const unsubscribe = subscribeWs(handleWebSocketMessage);

    return () => {
      unsubscribe();
    };
  }, [toast]);

  const handleAccept = (invitation: GameInvitation) => {
    onAcceptInvitation(invitation.gameType);
    setInvitations(prev => prev.filter(inv => inv.id !== invitation.id));
    
    toast({
      title: "Приглашение принято!",
      description: `Переходим к игре "${invitation.gameTitle}"`,
    });
  };

  const handleDecline = (invitationId: string) => {
    setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
    
    toast({
      title: "Приглашение отклонено",
      description: "Вы отклонили приглашение в игру",
    });
  };

  if (invitations.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 w-80">
      {invitations.map((invitation) => (
        <Card key={invitation.id} className="glass-strong border-border-subtle shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Приглашение в игру</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDecline(invitation.id)}
                className="h-6 w-6 p-0 hover:bg-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-2 mb-4">
              <p className="text-sm text-foreground">{invitation.message}</p>
              <p className="text-xs text-muted-foreground">
                от {invitation.inviterName}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={() => handleAccept(invitation)}
                size="sm" 
                className="flex-1 btn-gradient"
              >
                Принять
              </Button>
              <Button 
                onClick={() => handleDecline(invitation.id)}
                variant="outline" 
                size="sm" 
                className="flex-1"
              >
                Отклонить
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
