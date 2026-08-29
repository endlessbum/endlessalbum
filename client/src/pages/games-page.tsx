import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpCircle, Eye, Lightbulb, Hand } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Game } from "@shared/schema";
import { GameType, type GameType as WsGameType } from "@shared/ws-messages";

import TruthOrDareGame from "@/components/games/truth-or-dare";
import TwentyQuestionsGame from "@/components/games/twenty-questions";
import RolePlayingGame from "@/components/games/role-playing";
import PartnerQuizGame from "@/components/games/partner-quiz";
import InvitePartnerButton from "@/components/games/invite-partner-button";
import GameInvitationNotification from "@/components/games/game-invitation-notification";

export default function GamesPage() {
  const queryClient = useQueryClient();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);

  const { isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const createGameMutation = useMutation({
    mutationFn: async (gameType: WsGameType) => {
      const res = await apiRequest("/api/games", "POST", { 
        type: gameType,
        state: {},
        isActive: true 
      });
      return await res.json();
    },
    onSuccess: (game: Game) => {
      setCurrentGameId(game.id);
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
    },
  });

  const gamesList = [
    {
      id: GameType.TRUTH_OR_DARE,
      title: 'Правда или действие',
      description: 'Узнайте друг друга лучше',
      icon: HelpCircle,
    },
    {
      id: GameType.TWENTY_QUESTIONS,
      title: '20 вопросов',
      description: 'Угадайте что загадал партнер',
      icon: Eye,
    },
    {
      id: GameType.ROLE_PLAYING,
      title: 'Ролевая игра',
      description: 'Сыграйте роли в разных сценариях',
      icon: Lightbulb,
    },
    {
      id: GameType.PARTNER_QUIZ,
      title: 'Викторина о партнере',
      description: 'Насколько хорошо вы знаете друг друга?',
      icon: Hand,
    }
  ];

  const handleStartGame = (gameId: WsGameType) => {
    setSelectedGame(gameId);
    createGameMutation.mutate(gameId);
  };

  const handleBackToGames = () => {
    setSelectedGame(null);
    setCurrentGameId(null);
  };

  const handleAcceptInvitation = (gameType: WsGameType) => {
    setSelectedGame(gameType);
    createGameMutation.mutate(gameType);
  };

  const renderSelectedGame = () => {
    if (!currentGameId) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    switch (selectedGame) {
      case GameType.TRUTH_OR_DARE:
        return <TruthOrDareGame gameId={currentGameId} onBack={handleBackToGames} />;
      case GameType.TWENTY_QUESTIONS:
        return <TwentyQuestionsGame gameId={currentGameId} onBack={handleBackToGames} />;
      case GameType.ROLE_PLAYING:
        return <RolePlayingGame gameId={currentGameId} onBack={handleBackToGames} />;
      case GameType.PARTNER_QUIZ:
        return <PartnerQuizGame gameId={currentGameId} onBack={handleBackToGames} />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
  <div className="min-h-full flex items-center justify-center" data-testid="games-page">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent-strong"></div>
      </div>
    );
  }

  if (selectedGame) {
    return (
      <div className="flex min-h-full" data-testid="games-page">
        <main className="flex-1 p-6">
          {renderSelectedGame()}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full" data-testid="games-page">
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <GameInvitationNotification onAcceptInvitation={handleAcceptInvitation} />
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary mb-6 sm:mb-8">Игры</h1>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6" data-testid="games-grid">
            {gamesList.map((game) => {
              const Icon = game.icon;
              return (
                <Card 
                  key={game.id} 
                  className="hover:bg-surface-hover transition-colors cursor-pointer bg-surface border-border-subtle" 
                  onClick={() => handleStartGame(game.id)}
                  data-testid={`game-card-${game.id.replace(/_/g, '-')}`}
                >
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-lg border border-border-subtle bg-surface-soft flex items-center justify-center text-primary-foreground mb-4">
                      <Icon className="h-6 w-6 text-accent-strong" />
                    </div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">{game.title}</h3>
                    <p className="text-text-secondary mb-4">{game.description}</p>
                    <div className="space-y-2">
                      <Button 
                        className="w-full btn-gradient" 
                        disabled={createGameMutation.isPending}
                        data-testid={`button-start-${game.id}`}
                      >
                        {createGameMutation.isPending ? 'Создание...' : 'Начать игру'}
                      </Button>
                      <InvitePartnerButton gameType={game.id} gameTitle={game.title} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
