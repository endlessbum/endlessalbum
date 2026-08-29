import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Users, Clock, Star } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { subscribeWs, sendWs } from "@/lib/ws";
import type { PartnerResponse, TruthOrDareMessage } from "@shared/schema";
import { GameType } from "@shared/ws-messages";

interface TruthOrDareProps {
  gameId: string;
  onBack: () => void;
}

interface GameAction {
  type: 'truth' | 'dare';
  content: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: 'relationship' | 'fun' | 'deep' | 'spicy';
}

const truthQuestions: GameAction[] = [
  {
    type: 'truth',
    content: 'Что было самым романтичным в наших отношениях?',
    difficulty: 'easy',
    category: 'relationship'
  },
  {
    type: 'truth', 
    content: 'О чем ты мечтаешь, когда мы вместе?',
    difficulty: 'medium',
    category: 'deep'
  },
  {
    type: 'truth',
    content: 'Какую черту характера партнера ты больше всего ценишь?',
    difficulty: 'easy',
    category: 'relationship'
  },
  {
    type: 'truth',
    content: 'Какое место ты хотел(а) бы посетить вместе со мной?',
    difficulty: 'medium',
    category: 'fun'
  },
  {
    type: 'truth',
    content: 'Что ты чувствовал(а) при нашей первой встрече?',
    difficulty: 'medium',
    category: 'deep'
  },
  {
    type: 'truth',
    content: 'Какой твой любимый момент из наших отношений?',
    difficulty: 'easy',
    category: 'relationship'
  },
  {
    type: 'truth',
    content: 'О чем ты никогда мне не рассказывал(а)?',
    difficulty: 'hard',
    category: 'deep'
  },
  {
    type: 'truth',
    content: 'Что бы ты изменил(а) в наших отношениях?',
    difficulty: 'hard',
    category: 'relationship'
  }
];

const dareActions: GameAction[] = [
  {
    type: 'dare',
    content: 'Обними партнера в течение минуты без слов',
    difficulty: 'easy',
    category: 'relationship'
  },
  {
    type: 'dare',
    content: 'Станцуй медленный танец с партнером',
    difficulty: 'medium',
    category: 'fun'
  },
  {
    type: 'dare',
    content: 'Напиши партнеру любовное сообщение и отправь прямо сейчас',
    difficulty: 'easy',
    category: 'relationship'
  },
  {
    type: 'dare',
    content: 'Изобрази животное, а партнер должен угадать какое',
    difficulty: 'medium',
    category: 'fun'
  },
  {
    type: 'dare',
    content: 'Расскажи партнеру комплимент на другом языке',
    difficulty: 'medium',
    category: 'fun'
  },
  {
    type: 'dare',
    content: 'Устрой романтический ужин прямо сейчас',
    difficulty: 'hard',
    category: 'relationship'
  },
  {
    type: 'dare',
    content: 'Спой песню, которая напоминает о партнере',
    difficulty: 'medium',
    category: 'relationship'
  },
  {
    type: 'dare',
    content: 'Сделай массаж плеч партнеру в течение 2 минут',
    difficulty: 'easy',
    category: 'relationship'
  }
];

export default function TruthOrDareGame({ gameId, onBack }: TruthOrDareProps) {
  const { user } = useAuth();
  
  const [currentAction, setCurrentAction] = useState<GameAction | null>(null);
  const [selectedType, setSelectedType] = useState<'truth' | 'dare' | null>(null);
  const [gameState, setGameState] = useState({
    score: { truth: 0, dare: 0 },
    round: 1,
    currentPlayer: user?.id,
    partnerOnline: false,
    // Рейтинг за раунд: сколько заданий выполнил каждый игрок.
    turnRating: {} as Record<string, number>,
  });

  const { data: _partnerData } = useQuery<PartnerResponse>({
    queryKey: ["/api/partner"],
  });

  const handleGameMessage = (data: TruthOrDareMessage) => {
    const payload = (data as TruthOrDareMessage & { data: any }).data ?? {};
    switch (data.action) {
      case 'new_action':
        setCurrentAction(payload.actionData);
        break;
      case 'action_completed':
        setGameState(prev => ({
          ...prev,
          score: payload.score,
          round: prev.round + 1,
          currentPlayer: payload.nextPlayer,
          turnRating: payload.turnRating || prev.turnRating,
        }));
        // Очищаем карточку и на стороне партнёра: иначе у принявшего игрока
        // после «Выполнено» продолжал висеть старый вопрос.
        setCurrentAction(null);
        setSelectedType(null);
        break;
      case 'action_skipped':
        setCurrentAction(null);
        setSelectedType(null);
        setGameState(prev => ({
          ...prev,
          round: prev.round + 1,
          currentPlayer: payload.nextPlayer,
        }));
        break;
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeWs((event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'game_action' && data.gameType === GameType.TRUTH_OR_DARE) {
          handleGameMessage(data);
        } else if (data.type === 'partner_status_change') {
          setGameState(prev => ({ ...prev, partnerOnline: data.isOnline }));
        }
      } catch {
        // ignore
      }
    });

    return unsubscribe;
  }, []);

  const sendGameMessage = (action: string, data: unknown) => {
    sendWs({
      type: 'game_action',
      gameType: GameType.TRUTH_OR_DARE,
      gameId,
      action,
      data,
      senderId: user?.id
    });
  };

  const getRandomAction = (type: 'truth' | 'dare') => {
    const actions = type === 'truth' ? truthQuestions : dareActions;
    return actions[Math.floor(Math.random() * actions.length)];
  };

  const handleChooseAction = (type: 'truth' | 'dare') => {
    const action = getRandomAction(type);
    setCurrentAction(action);
    setSelectedType(type);

    sendGameMessage('new_action', action);
  };

  const handleCompleteAction = () => {
    const newScore = { ...gameState.score };
    if (selectedType) {
      newScore[selectedType]++;
    }

    const nextPlayer = gameState.currentPlayer === user?.id ? _partnerData?.partner?.id : user?.id;

    // Рейтинг за раунд: игрок, выполнивший задание, получает очко.
    const turnRating = { ...gameState.turnRating };
    if (user?.id) {
      turnRating[user.id] = (turnRating[user.id] || 0) + 1;
    }

    setGameState(prev => ({
      ...prev,
      score: newScore,
      round: prev.round + 1,
      currentPlayer: nextPlayer,
      turnRating,
    }));
    
    sendGameMessage('action_completed', {
      score: newScore,
      nextPlayer,
      turnRating,
    });
    
    setCurrentAction(null);
    setSelectedType(null);
  };

  const handleSkipAction = () => {
    const nextPlayer = gameState.currentPlayer === user?.id ? _partnerData?.partner?.id : user?.id;
    setCurrentAction(null);
    setSelectedType(null);
    setGameState(prev => ({
      ...prev,
      round: prev.round + 1,
      currentPlayer: nextPlayer,
    }));
    // Skip синхронизируем с партнёром: иначе у него продолжал висеть вопрос,
    // а ход никуда не переходил.
    sendGameMessage('action_skipped', { nextPlayer });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-surface-soft text-text-primary';
      case 'medium': return 'bg-surface-soft text-text-primary';
      case 'hard': return 'bg-surface-soft text-text-primary';
      default: return 'bg-surface-soft text-text-primary';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'relationship': return 'bg-surface-soft text-text-primary';
      case 'fun': return 'bg-surface-soft text-text-primary';
      case 'deep': return 'bg-surface-soft text-text-primary';
      case 'spicy': return 'bg-surface-soft text-text-primary';
      default: return 'bg-surface-soft text-text-primary';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button 
            variant="ghost" 
            onClick={onBack}
            data-testid="button-back"
          >
            ← Назад к играм
          </Button>
          <h1 className="text-3xl font-bold text-foreground mt-2">Правда или Действие</h1>
          <p className="text-muted-foreground">Узнайте друг друга лучше</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <span className={`text-sm ${gameState.partnerOnline ? 'text-text-primary' : 'text-secondary'}`}>
              {gameState.partnerOnline ? 'Партнер в игре' : 'Ждем партнера...'}
            </span>
          </div>
        </div>
      </div>

      <Card className="glass">
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-text-primary">{gameState.score.truth}</div>
              <div className="text-sm text-muted-foreground">Правда</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{gameState.round}</div>
              <div className="text-sm text-muted-foreground">Раунд</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-secondary">{gameState.score.dare}</div>
              <div className="text-sm text-muted-foreground">Действие</div>
            </div>
          </div>
          {Object.keys(gameState.turnRating).length > 0 && (
            <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">Рейтинг:</span>
              {Object.entries(gameState.turnRating).map(([playerId, count]) => (
                <span key={playerId} className="text-sm font-medium">
                  {playerId === user?.id ? 'Вы' : 'Партнёр'}: <span className="text-primary">{count}</span>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {currentAction ? (
        <Card className="glass" data-testid="phase-action">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${currentAction.type === 'truth' ? 'bg-primary' : 'bg-surface-hover'}`} />
              {currentAction.type === 'truth' ? 'Правда' : 'Действие'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-lg text-foreground p-4 rounded-lg bg-surface border border-border-subtle">
              {currentAction.content}
            </div>
            
            <div className="flex gap-2">
              <Badge className={getDifficultyColor(currentAction.difficulty)}>
                {currentAction.difficulty === 'easy' ? 'Легко' : 
                 currentAction.difficulty === 'medium' ? 'Средне' : 'Сложно'}
              </Badge>
              <Badge className={getCategoryColor(currentAction.category)}>
                {currentAction.category === 'relationship' ? 'Отношения' :
                 currentAction.category === 'fun' ? 'Веселье' :
                 currentAction.category === 'deep' ? 'Глубоко' : 'Остро'}
              </Badge>
            </div>
            
            <div className="flex gap-3">
              <Button 
                onClick={handleCompleteAction}
                className="flex-1"
                data-testid="button-complete"
              >
                <Star className="h-4 w-4 mr-2" />
                Выполнено!
              </Button>
              <Button 
                variant="outline" 
                onClick={handleSkipAction}
                data-testid="button-skip"
              >
                Пропустить
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Action Selection */
        <Card className="glass" data-testid="phase-selection">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Выберите действие
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                size="lg"
                className="h-24 bg-primary text-primary-foreground"
                onClick={() => handleChooseAction('truth')}
                disabled={!gameState.partnerOnline}
                data-testid="button-truth"
              >
                <div className="text-center">
                  <div className="text-xl font-bold">ПРАВДА</div>
                  <div className="text-sm text-primary-foreground">Ответьте честно</div>
                </div>
              </Button>
              
              <Button
                size="lg"
                className="h-24 bg-surface-hover text-text-primary"
                onClick={() => handleChooseAction('dare')}
                disabled={!gameState.partnerOnline}
                data-testid="button-dare"
              >
                <div className="text-center">
                  <div className="text-xl font-bold">ДЕЙСТВИЕ</div>
                  <div className="text-sm text-primary-foreground">Выполните задание</div>
                </div>
              </Button>
            </div>
            
            {!gameState.partnerOnline && (
              <div className="text-center mt-4 text-muted-foreground">
                <Clock className="h-5 w-5 mx-auto mb-2" />
                Ждем подключения партнера...
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}