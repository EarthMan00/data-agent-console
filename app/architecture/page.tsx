import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowRight, Database, Globe, Layers, Layout, Server, Shield, Sparkles, Users, Zap } from "lucide-react";

export default function BusinessArchitecture() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">跨境选品 Agent 业务架构图</h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            面向跨境卖家的 AI 选品运营助手（More Data Agent 的快速市场验证版本）
          </p>
        </div>

        {/* 1. 用户触点层 */}
        <Card className="border-t-4 border-t-blue-500 shadow-md">
          <CardHeader className="bg-blue-50/50 pb-4">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Users className="h-5 w-5" />
              1. 用户触点层 (Target Audience)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center hover:border-blue-300 transition-colors">
                <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                  <Globe className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-800">跨境电商选品经理</h3>
                <p className="text-sm text-slate-500 mt-1">寻找蓝海类目，分析市场容量与竞争格局</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center hover:border-blue-300 transition-colors">
                <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                  <Zap className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-800">亚马逊/平台运营</h3>
                <p className="text-sm text-slate-500 mt-1">监控竞品打法，分析流量词与转化策略</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center text-center hover:border-blue-300 transition-colors">
                <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-800">出海品牌分析师</h3>
                <p className="text-sm text-slate-500 mt-1">提炼消费者痛点，指导产品迭代与营销</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center -my-4 relative z-10">
          <div className="bg-slate-200 rounded-full p-2 shadow-inner">
            <ArrowDown className="h-6 w-6 text-slate-500" />
          </div>
        </div>

        {/* 2. 核心产品层 */}
        <Card className="border-t-4 border-t-indigo-500 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Layout className="h-32 w-32" />
          </div>
          <CardHeader className="bg-indigo-50/50 pb-4">
            <CardTitle className="flex items-center gap-2 text-indigo-700">
              <Layout className="h-5 w-5" />
              2. Agent 交互工作台 (核心产品体验层 / UI 套壳)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm border-l-4 border-l-indigo-400">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded font-mono">Input</span>
                      对话式指令入口
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600">自然语言输入，支持语音转文字。系统自动提取“平台”、“类目”、“价格带”、“分析维度”等实体。</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm border-l-4 border-l-indigo-400">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded font-mono">Process</span>
                      执行流可视化剧场
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600">将单一请求拆解为“多工具协同调用”的视觉动画。制造“Agent正在替我加班看数据”的高级感与信任感。</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm border-l-4 border-l-indigo-400 h-full">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded font-mono">Output</span>
                      多维选品报告看板
                    </h3>
                    <Badge variant="secondary" className="text-indigo-600 border-indigo-200 bg-white">核心交付物</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mb-3">结构化展示商业结论与支撑数据，代替传统Excel表格。</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-normal">市场容量测算</Badge>
                    <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-normal">BSR&价格趋势</Badge>
                    <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-normal">流量词反查</Badge>
                    <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-normal">NLP痛点提炼</Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center -my-4 relative z-10">
          <div className="bg-slate-200 rounded-full p-2 shadow-inner">
            <ArrowDown className="h-6 w-6 text-slate-500" />
          </div>
        </div>

        {/* 3. 业务逻辑层 */}
        <Card className="border-t-4 border-t-amber-500 shadow-md">
          <CardHeader className="bg-amber-50/50 pb-4">
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <Server className="h-5 w-5" />
              3. 代理与调度层 (BFF Backend / 业务黑盒)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-stretch justify-between gap-4">
              
              <div className="flex-1 bg-white p-4 rounded-lg border border-amber-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-3 text-center border-b pb-2">意图解析引擎</h3>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> LLM 提示词组装</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 实体抽取 (NER)</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 路由决策 (LLM / 工具 / 外部服务)</li>
                </ul>
              </div>

              <div className="hidden md:flex flex-col justify-center items-center px-2">
                <ArrowRight className="text-amber-300" />
              </div>

              <div className="flex-1 bg-amber-50 p-4 rounded-lg border-2 border-dashed border-amber-300 shadow-sm relative">
                <Badge className="absolute -top-3 -right-3 bg-amber-500 hover:bg-amber-600 shadow-sm">核心编排区</Badge>
                <h3 className="font-semibold text-amber-900 mb-3 text-center border-b border-amber-200 pb-2">More Data Agent 适配层</h3>
                <ul className="space-y-2 text-sm text-amber-800">
                  <li className="flex items-center gap-2"><Shield className="h-3 w-3" /> Cookie / Token 池管理</li>
                  <li className="flex items-center gap-2"><Shield className="h-3 w-3" /> 请求伪装与反爬对抗</li>
                  <li className="flex items-center gap-2"><Shield className="h-3 w-3" /> 接口请求转发 (Proxy)</li>
                </ul>
              </div>

              <div className="hidden md:flex flex-col justify-center items-center px-2">
                <ArrowRight className="text-amber-300" />
              </div>

              <div className="flex-1 bg-white p-4 rounded-lg border border-amber-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-3 text-center border-b pb-2">数据归一化模块</h3>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 剔除底层冗余字段</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 统一 Evidence 数据结构</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 缓存热点查询结果</li>
                </ul>
              </div>

            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center -my-4 relative z-10">
          <div className="bg-slate-200 rounded-full p-2 shadow-inner">
            <ArrowDown className="h-6 w-6 text-slate-500" />
          </div>
        </div>

        {/* 4. 底层依赖层 */}
        <Card className="border-t-4 border-t-emerald-500 shadow-md bg-slate-900 text-slate-100">
          <CardHeader className="border-b border-slate-800 pb-4">
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              <Layers className="h-5 w-5" />
              4. 底层能力层 (被套壳方 / 真实数据源)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center">
              <div className="w-full max-w-md bg-slate-800 p-4 rounded-lg border border-slate-700 text-center mb-6 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg">
                  核心数据引擎
                </div>
                <h3 className="text-xl font-bold text-white mt-2">More Data Agent / 聚合数据 API</h3>
                <p className="text-slate-400 text-sm mt-1">提供经过聚合处理的跨源电商数据</p>
              </div>
              
              <div className="w-full border-t border-slate-700 relative mb-6">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 px-2 text-slate-500 text-xs">
                  底层真实工具矩阵
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50 text-center flex flex-col items-center">
                  <Database className="h-5 w-5 text-slate-400 mb-2" />
                  <span className="text-sm font-medium text-slate-300">卖家精灵 (销量/垄断)</span>
                </div>
                <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50 text-center flex flex-col items-center">
                  <Database className="h-5 w-5 text-slate-400 mb-2" />
                  <span className="text-sm font-medium text-slate-300">Keepa (历史价格/BSR)</span>
                </div>
                <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50 text-center flex flex-col items-center">
                  <Database className="h-5 w-5 text-slate-400 mb-2" />
                  <span className="text-sm font-medium text-slate-300">SIF (流量词/广告位)</span>
                </div>
                <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50 text-center flex flex-col items-center">
                  <Database className="h-5 w-5 text-slate-400 mb-2" />
                  <span className="text-sm font-medium text-slate-300">Review 语义分析</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
