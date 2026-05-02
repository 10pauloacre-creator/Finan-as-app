'use client';

import { useMemo, useState } from 'react';
import { BandeirCartao, BancoSlug } from '@/types';
import cartaoAmazon from '@/app/icons/cartãoamazon.png';
import cartaoItau from '@/app/icons/cartãoitaú.png';
import cartaoMercadoPago from '@/app/icons/cartãomercadopago.png';
import cartaoNubank from '@/app/icons/cartãonubank.png';

const BANDEIRA_INFO: Record<BandeirCartao, { nome: string; logoUrl?: string; cor: string; texto: string }> = {
  visa: {
    nome: 'Visa',
    logoUrl: 'https://www.visa.com.br/favicon.ico',
    cor: '#1434CB',
    texto: '#FFFFFF',
  },
  mastercard: {
    nome: 'Mastercard',
    logoUrl: 'https://www.mastercard.com.br/favicon.ico',
    cor: '#EB001B',
    texto: '#FFFFFF',
  },
  elo: {
    nome: 'Elo',
    logoUrl: 'https://www.elo.com.br/favicon.ico',
    cor: '#F6C515',
    texto: '#111827',
  },
  amex: {
    nome: 'American Express',
    logoUrl: 'https://www.americanexpress.com/favicon.ico',
    cor: '#2E77BC',
    texto: '#FFFFFF',
  },
  hipercard: {
    nome: 'Hipercard',
    logoUrl: 'https://www.hipercard.com.br/favicon.ico',
    cor: '#C8102E',
    texto: '#FFFFFF',
  },
};

function siglaBandeira(nome: string) {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

interface CardBrandLogoProps {
  bandeira: BandeirCartao;
  banco?: BancoSlug;
  nomeCartao?: string;
  className?: string;
  size?: number;
}

function normalizar(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function CardBrandLogo({ bandeira, banco, nomeCartao, className = '', size = 24 }: CardBrandLogoProps) {
  const [erro, setErro] = useState(false);
  const info = BANDEIRA_INFO[bandeira];
  const logoUrl = useMemo(() => {
    const nome = normalizar(nomeCartao || '');
    if (nome.includes('amazon')) return cartaoAmazon.src;
    if (banco === 'nubank') return cartaoNubank.src;
    if (banco === 'itau') return cartaoItau.src;
    if (banco === 'mercadopago') return cartaoMercadoPago.src;
    return info.logoUrl;
  }, [banco, info.logoUrl, nomeCartao]);

  if (!logoUrl || erro) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden font-bold ${className}`}
        style={{ width: size, height: size, background: info.cor, color: info.texto, fontSize: Math.max(8, Math.round(size * 0.28)) }}
        title={info.nome}
        aria-label={info.nome}
      >
        {siglaBandeira(info.nome)}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      title={info.nome}
      aria-label={info.nome}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={info.nome}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setErro(true)}
      />
    </div>
  );
}
