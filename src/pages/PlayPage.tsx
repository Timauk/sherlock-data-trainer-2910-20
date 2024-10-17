import React, { useState, useEffect } from 'react';
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useTheme } from 'next-themes';
import * as tf from '@tensorflow/tfjs';
import DataUploader from '@/components/DataUploader';
import GameControls from '@/components/GameControls';
import { createModel, trainModel, normalizeData, denormalizeData, addDerivedFeatures, TrainingConfig } from '@/utils/aiModel';

interface Player {
  id: number;
  score: number;
  predictions: number[];
}

const PlayPage: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [generation, setGeneration] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [evolutionData, setEvolutionData] = useState<any[]>([]);
  const [boardNumbers, setBoardNumbers] = useState<number[]>([]);
  const [csvData, setCsvData] = useState<number[][]>([]);
  const [trainedModel, setTrainedModel] = useState<tf.LayersModel | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    initializePlayers();
    createModel().then(setTrainedModel);
  }, []);

  const addLog = (message: string) => {
    setLogs(prevLogs => [...prevLogs, message]);
  };

  const loadCSV = async (file: File) => {
    const text = await file.text();
    const data = processCSV(text);
    const normalizedData = normalizeData(data);
    const dataWithFeatures = addDerivedFeatures(normalizedData);
    setCsvData(dataWithFeatures);
    addLog("CSV carregado e processado com sucesso!");
  };

  const loadModel = async (jsonFile: File, binFile: File) => {
    const model = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, binFile]));
    setTrainedModel(model);
    addLog("Modelo treinado carregado com sucesso!");
  };

  const initializePlayers = () => {
    const newPlayers = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      score: 0,
      predictions: []
    }));
    setPlayers(newPlayers);
  };

  const playGame = () => {
    setIsPlaying(true);
    gameLoop();
  };

  const pauseGame = () => {
    setIsPlaying(false);
  };

  const resetGame = () => {
    setIsPlaying(false);
    setGeneration(1);
    setProgress(0);
    setEvolutionData([]);
    setBoardNumbers([]);
    initializePlayers();
    setLogs([]);
  };

  const gameLoop = async () => {
    if (!isPlaying || !trainedModel) return;

    const newBoardNumbers = csvData.length > 0 
      ? denormalizeData([csvData[Math.floor(Math.random() * csvData.length)]])[0]
      : Array.from({ length: 15 }, () => Math.floor(Math.random() * 25) + 1);
    setBoardNumbers(newBoardNumbers);

    const normalizedInput = normalizeData([newBoardNumbers])[0];
    const inputTensor = tf.tensor2d([normalizedInput]);
    const predictions = await trainedModel.predict(inputTensor) as tf.Tensor;
    const denormalizedPredictions = denormalizeData(await predictions.array())[0];

    const updatedPlayers = players.map(player => {
      const playerPredictions = denormalizedPredictions.map(Math.round);
      const matches = playerPredictions.filter(num => newBoardNumbers.includes(num)).length;
      const reward = calculateDynamicReward(matches, players.length);
      addLog(`Jogador ${player.id}: ${matches} acertos, recompensa ${reward}`);
      return {
        ...player,
        score: player.score + reward,
        predictions: playerPredictions
      };
    });

    setPlayers(updatedPlayers);
    setProgress((prevProgress) => (prevProgress + 1) % 100);

    if (progress === 99) {
      evolveGeneration();
    } else {
      setTimeout(gameLoop, 100);
    }

    inputTensor.dispose();
    predictions.dispose();
  };

  const evolveGeneration = () => {
    const bestScore = Math.max(...players.map(p => p.score));
    const newPlayers = players.map(player => ({
      ...player,
      score: player.score === bestScore ? player.score : 0
    }));
    
    setPlayers(newPlayers);
    setGeneration(prev => prev + 1);
    setEvolutionData(prev => [...prev, { generation, score: bestScore }]);
    addLog(`Geração ${generation} concluída. Melhor pontuação: ${bestScore}`);
  };

  const calculateDynamicReward = (matches: number, totalPlayers: number): number => {
    const baseReward = Math.pow(10, matches - 10);
    const competitionFactor = 1 + (totalPlayers / 100);
    return Math.round(baseReward * competitionFactor);
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4 neon-title">SHERLOK</h2>
      
      <DataUploader onCsvUpload={loadCSV} onModelUpload={loadModel} />

      <GameControls
        isPlaying={isPlaying}
        onPlay={playGame}
        onPause={pauseGame}
        onReset={resetGame}
        onThemeToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />

      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Progresso da Geração {generation}</h3>
        <Progress value={progress} className="w-full" />
      </div>

      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Quadro (Banca)</h3>
        <div className="bg-gray-100 p-4 rounded-lg">
          {boardNumbers.map((number, index) => (
            <span key={index} className="inline-block bg-blue-500 text-white rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">
              {number}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4 mb-8">
        {players.map(player => (
          <div key={player.id} className="bg-gray-100 p-4 rounded-lg">
            <h4 className="font-semibold">Jogador {player.id}</h4>
            <p>Pontuação: {player.score}</p>
            <p>Previsões: {player.predictions.join(', ')}</p>
          </div>
        ))}
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Evolução das Gerações</h3>
        <LineChart width={600} height={300} data={evolutionData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="generation" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="score" stroke="#8884d8" />
        </LineChart>
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Logs em Tempo Real</h3>
        <div className="bg-gray-100 p-4 rounded-lg h-64 overflow-y-auto">
          {logs.map((log, index) => (
            <p key={index}>{log}</p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlayPage;