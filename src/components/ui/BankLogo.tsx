'use client';

import { useMemo, useState } from 'react';
import { BANCO_INFO, BancoSlug } from '@/types';

const DOMINIOS_OFICIAIS: Partial<Record<BancoSlug, string>> = {
  nubank: 'https://nubank.com.br/favicon.ico',
  itau: 'https://www.itau.com.br/favicon.ico',
  bradesco: 'https://banco.bradesco/favicon.ico',
  bb: 'https://www.bb.com.br/favicon.ico',
  caixa: 'https://www.caixa.gov.br/favicon.ico',
  inter: 'https://inter.co/favicon.ico',
  c6: 'https://www.c6bank.com.br/favicon.ico',
  santander: 'https://www.santander.com.br/favicon.ico',
  mercadopago: 'https://www.mercadopago.com.br/favicon.ico',
};

function bancoSigla(nome: string) {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

interface BankLogoProps {
  banco: BancoSlug;
  className?: string;
  size?: number;
}

export default function BankLogo({ banco, className = '', size = 32 }: BankLogoProps) {
  const [erro, setErro] = useState(false);
  const info = BANCO_INFO[banco] || BANCO_INFO.outro;
  const logoUrl = useMemo(() => info.logoUrl || DOMINIOS_OFICIAIS[banco], [banco, info.logoUrl]);

  if (!logoUrl || erro) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden font-bold ${className}`}
        style={{ width: size, height: size, background: info.cor, color: info.corTexto, fontSize: Math.max(10, Math.round(size * 0.34)) }}
        aria-label={info.nome}
        title={info.nome}
      >
        {bancoSigla(info.nome)}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-white ${className}`}
      style={{ width: size, height: size }}
      aria-label={info.nome}
      title={info.nome}
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
