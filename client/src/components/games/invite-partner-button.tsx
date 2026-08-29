import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isWsOpen, sendWs, subscribeWs } from "@/lib/ws";
import type { GameType } from "@shared/ws-messages";

interface InvitePartnerButtonProps {
  gameType: GameType;
  gameTitle: string;
  onInviteSent?: () => void;
  disabled?: boolean;
}

export default function InvitePartnerButton({ 
  gameType, 
  gameTitle, 
  onInviteSent,
  disabled = false 
}: InvitePartnerButtonProps) {
  const [isInviting, setIsInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const ackReceivedRef = useRef(false);
  const { toast } = useToast();

  const sendInvitation = () => {
    if (disabled || isInviting) return;

    if (!isWsOpen()) {
      setIsInviting(false);
      toast({
        title: "Нет соединения",
        description: "Отсутствует соединение с сервером",
        variant: "destructive"
      });
      return;
    }

    setIsInviting(true);
    ackReceivedRef.current = false;

    const unsubscribe = subscribeWs((event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'invitation_sent' && data.gameType === gameType) {
          ackReceivedRef.current = true;
          unsubscribe();
          setIsInviting(false);
          setInviteSent(true);

          toast({
            title: "Приглашение отправлено!",
            description: `Ваш партнер получил приглашение в игру "${gameTitle}"`,
          });

          onInviteSent?.();

          setTimeout(() => {
            setInviteSent(false);
          }, 3000);
        }
      } catch {
      }
    });

    const sent = sendWs({
      type: 'game_invitation',
      gameType,
      gameTitle,
      message: `Приглашение поиграть в "${gameTitle}"`
    });

    if (!sent) {
      unsubscribe();
      setIsInviting(false);
      toast({
        title: "Нет соединения",
        description: "Отсутствует соединение с сервером",
        variant: "destructive"
      });
      return;
    }

    setTimeout(() => {
      unsubscribe();
      if (!ackReceivedRef.current) {
        setIsInviting(false);
        toast({
          title: "Ошибка отправки",
          description: "Не удалось отправить приглашение. Попробуйте снова.",
          variant: "destructive"
        });
      }
    }, 5000);
  };

  return (
    <Button 
      onClick={sendInvitation}
      disabled={disabled || isInviting || inviteSent}
      variant={inviteSent ? "default" : "outline"}
      size="sm"
      className={`
        flex items-center gap-2 transition-all duration-200
        ${inviteSent ? 'bg-primary text-primary-foreground hover:bg-accent-hover' : ''}
      `}
    >
      {isInviting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Отправка...
        </>
      ) : inviteSent ? (
        <>
          <Check className="h-4 w-4" />
          Отправлено
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" />
          Пригласить партнера
        </>
      )}
    </Button>
  );
}
