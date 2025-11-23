import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Download, X, Settings, Plus, Trash2, FileText, Loader2, Github, RefreshCw, ChevronDown, AlertCircle, Globe, Edit2, Save, Link as LinkIcon, ExternalLink, Tag, Eye, Info } from 'lucide-react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function App() {
  // --- Data ---
  const [sources, setSources] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  
  // --- UI ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('github');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState(null); 
  const [activeCardId, setActiveCardId] = useState(null); 
  const [contextMenuPdf, setContextMenuPdf] = useState(null); 
  const [errorMsg, setErrorMsg] = useState(null);
  
  // --- Edit Mode ---
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  // --- Form ---
  const [ghOwner, setGhOwner] = useState('');
  const [ghRepo, setGhRepo] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');

  // --- Autocomplete ---
  const [suggestedRepos, setSuggestedRepos] = useState([]); 
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [repoFetchError, setRepoFetchError] = useState(null);
  
  const ignoreNextSearch = useRef(false);
  const debouncedRepoSearch = useDebounce(ghRepo, 500);
  const debouncedOwnerSearch = useDebounce(ghOwner, 500);
  
  const dropdownRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // --- Scroll Lock ---
  useEffect(() => {
    const isLocked = isSettingsOpen || selectedPdf || contextMenuPdf;
    const html = document.documentElement;
    const body = document.body;

    if (isLocked) {
      scrollPositionRef.current = window.scrollY;
      const styles = {
        position: 'fixed',
        top: `-${scrollPositionRef.current}px`,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        overscrollBehavior: 'none',
      };
      Object.assign(body.style, styles);
      Object.assign(html.style, { overflow: 'hidden', height: '100%' });
    } else {
      body.removeAttribute('style');
      html.removeAttribute('style');
      window.scrollTo(0, scrollPositionRef.current);
    }
    return () => {
      body.removeAttribute('style');
      html.removeAttribute('style');
    };
  }, [isSettingsOpen, selectedPdf, contextMenuPdf]);

  // --- Init ---
  useEffect(() => {
    // 使用一个固定的 Key，部署后你的数据就会稳定保存在这里
    const savedSources = localStorage.getItem('pdf_lib_storage_final'); 
    if (savedSources) {
      const parsed = JSON.parse(savedSources);
      setSources(parsed);
      if (parsed.length > 0) {
        fetchAllPdfs(parsed);
      } else {
        setIsSettingsOpen(true);
      }
    } else {
      setIsSettingsOpen(true);
    }

    const handleGlobalClick = (e) => {
      if (e.target.closest('.pdf-card-interactive')) return;
      setActiveCardId(null);
    };
    
    const handleDropdownClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleGlobalClick);
    document.addEventListener('touchstart', handleGlobalClick); 
    document.addEventListener('mousedown', handleDropdownClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      document.removeEventListener('touchstart', handleGlobalClick);
      document.removeEventListener('mousedown', handleDropdownClickOutside);
    };
  }, []);

  const handleLinkUrlChange = (e) => {
    const url = e.target.value;
    setLinkUrl(url);
    if (!linkName || linkName === extractNameFromUrl(linkUrl)) {
      const extracted = extractNameFromUrl(url);
      if (extracted) setLinkName(extracted);
    }
  };

  const extractNameFromUrl = (url) => {
    try {
      if (!url) return '';
      const pathname = new URL(url).pathname;
      const filename = pathname.split('/').pop();
      return decodeURIComponent(filename.replace(/\.pdf$/i, '')) || '未命名文档';
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    if (ignoreNextSearch.current) {
      ignoreNextSearch.current = false;
      return;
    }
    if (isSettingsOpen && activeTab === 'github' && debouncedOwnerSearch) {
       searchRepos(debouncedRepoSearch);
    }
  }, [debouncedRepoSearch, debouncedOwnerSearch, isSettingsOpen, activeTab]);

  const searchRepos = async (searchTerm) => {
    if (!debouncedOwnerSearch.trim()) return;
    setIsFetchingRepos(true);
    setRepoFetchError(null);
    
    try {
      let url = '';
      if (!searchTerm.trim()) {
        url = `https://api.github.com/users/${debouncedOwnerSearch.trim()}/repos?sort=updated&per_page=30`;
      } else {
        const query = encodeURIComponent(`${searchTerm} user:${debouncedOwnerSearch.trim()}`);
        url = `https://api.github.com/search/repositories?q=${query}&sort=updated&per_page=30`;
      }

      const res = await fetch(url);
      if (res.status === 404) {
         if (!searchTerm.trim()) throw new Error('用户不存在'); 
      }
      if (res.status === 403) throw new Error('API 请求过快');
      if (!res.ok && res.status !== 404) throw new Error('获取失败');
      
      const data = await res.json();
      if (data.message === "Not Found") throw new Error('用户不存在');

      const repos = Array.isArray(data) ? data : (data.items || []);
      const currentOwnerLower = debouncedOwnerSearch.trim().toLowerCase();
      const filteredNames = repos
        .map(r => r.name)
        .filter(repoName => {
          const isAlreadyAdded = sources.some(source => 
            source.type === 'github' &&
            source.owner.toLowerCase() === currentOwnerLower && 
            source.repo.toLowerCase() === repoName.toLowerCase()
          );
          return !isAlreadyAdded;
        });

      setSuggestedRepos(filteredNames);
      if (filteredNames.length > 0 || (repos.length > 0 && filteredNames.length === 0)) {
        setShowSuggestions(true);
      } else if (repos.length === 0 && searchTerm.trim()) {
         setShowSuggestions(true);
      }
    } catch (err) {
      setRepoFetchError(err.message);
      setSuggestedRepos([]);
      setShowSuggestions(true);
    } finally {
      setIsFetchingRepos(false);
    }
  };

  const addGithubSource = () => {
    if (!ghOwner.trim() || !ghRepo.trim()) return;
    const newSource = { 
      id: Date.now(), 
      type: 'github',
      owner: ghOwner.trim(), 
      repo: ghRepo.trim(),
      addedAt: new Date().toISOString()
    };
    updateSources([...sources, newSource]);
    setGhRepo(''); 
    setSuggestedRepos([]);
    setShowSuggestions(false);
    ignoreNextSearch.current = false; 
  };

  const handleSuggestionClick = (repoName) => {
    ignoreNextSearch.current = true;
    setGhRepo(repoName);
    setShowSuggestions(false);
  };

  const addLinkSource = () => {
    if (!linkUrl.trim() || !linkName.trim()) return;
    const newSource = {
      id: Date.now(),
      type: 'link',
      url: linkUrl.trim(),
      name: linkName.trim(),
      addedAt: new Date().toISOString()
    };
    updateSources([...sources, newSource]);
    setLinkUrl('');
    setLinkName('');
  };

  const removeSource = (id) => {
    updateSources(sources.filter(s => s.id !== id));
  };

  const startEditing = (source) => {
    setEditingSourceId(source.id);
    setEditNameValue(source.name || '');
  };

  const saveEditing = (id) => {
    const updated = sources.map(s => {
      if (s.id === id) return { ...s, name: editNameValue };
      return s;
    });
    updateSources(updated);
    setEditingSourceId(null);
  };

  const updateSources = (newList) => {
    setSources(newList);
    localStorage.setItem('pdf_lib_storage_final', JSON.stringify(newList));
  };

  const fetchAllPdfs = async (sourceList) => {
    setIsLoading(true);
    setErrorMsg(null);
    
    const githubSources = sourceList.filter(s => s.type === 'github' || !s.type);
    const linkSources = sourceList.filter(s => s.type === 'link');

    const ghPromises = githubSources.map(async (source) => {
      try {
        const response = await fetch(`https://api.github.com/repos/${source.owner}/${source.repo}/releases/latest`);
        if (!response.ok) return null;
        const data = await response.json();
        
        return (data.assets || [])
          .filter(asset => asset.name.toLowerCase().endsWith('.pdf'))
          .map(asset => ({
            id: asset.id,
            uniqueId: `gh-${asset.id}`,
            type: 'github',
            name: asset.name,
            downloadUrl: asset.browser_download_url,
            size: (asset.size / 1024 / 1024).toFixed(2) + ' MB',
            date: new Date(asset.created_at).toLocaleDateString(),
            rawDate: new Date(asset.created_at),
            version: data.tag_name,
            sourceName: `${source.owner}/${source.repo}`,
            repoUrl: data.html_url,
            owner: source.owner,
            repo: source.repo
          }));
      } catch (error) { return null; }
    });

    const linkPdfs = linkSources.map(source => ({
      id: source.id,
      uniqueId: `link-${source.id}`,
      type: 'link',
      name: source.name,
      downloadUrl: source.url,
      size: 'Unknown',
      date: new Date(source.addedAt).toLocaleDateString(),
      rawDate: new Date(source.addedAt),
      version: 'Link',
      sourceName: new URL(source.url).hostname,
      url: source.url
    }));

    const ghResults = await Promise.all(ghPromises);
    const flatGhPdfs = ghResults.flat().filter(Boolean);
    const allPdfs = [...flatGhPdfs, ...linkPdfs];
    
    allPdfs.sort((a, b) => b.rawDate - a.rawDate);

    setPdfs(allPdfs);
    setIsLoading(false);
    
    if (allPdfs.length === 0 && sourceList.length > 0) {
      setErrorMsg("未在添加的源中找到 PDF 文件。");
    }
  };

  const handleRefresh = () => {
    fetchAllPdfs(sources);
    setIsSettingsOpen(false);
  };

  // --- Smart Description (No Container for Short Text) ---
  const SmartDescription = ({ text, loading }) => {
    if (loading) {
      return (
        <div className="space-y-2 animate-pulse"> 
          <div className="h-3 w-3/4 bg-gray-100 rounded"></div>
          <div className="h-3 w-1/2 bg-gray-100 rounded"></div>
        </div>
      );
    }

    if (!text) return <div className="text-xs text-gray-400 italic">暂无描述</div>;

    const threshold = 100;
    const isLong = text.length > threshold;

    if (isLong) {
      return (
        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-sm text-gray-600 leading-relaxed max-h-32 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-gray-200 pr-1">
          {text}
        </div>
      );
    }

    // Direct render for short text
    return (
      <div className="text-sm text-gray-600 leading-relaxed pl-1">
        {text}
      </div>
    );
  };

  const PdfCard = ({ pdf, isActive, onSelect, onPreview, onOpenMenu }) => {
    // Simplified click handler, relying on onClick standard event flow
    return (
      <div 
        onClick={onSelect}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        className={`
          pdf-card-interactive
          bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col select-none transition-all duration-200
          ${isActive ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-100 hover:shadow-md'}
        `}
      >
        <div className="p-4 flex-1 flex flex-col cursor-pointer"> 
          <div className="flex items-center justify-between mb-3 min-h-[2rem]">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg transition-colors ${pdf.type === 'github' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-500'}`}>
                {pdf.type === 'github' ? <Github className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
              </div>
              
              <div 
                className={`
                  flex items-center overflow-hidden transition-all duration-300 ease-out
                  ${isActive ? 'max-w-[100px] opacity-100 ml-1 pointer-events-auto' : 'max-w-0 opacity-0 pointer-events-none'}
                `}
              >
                 <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      onOpenMenu(pdf); 
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-gray-600 text-[11px] font-bold rounded-md whitespace-nowrap transition-colors border border-transparent hover:border-indigo-200"
                 >
                    <Info className="w-3 h-3" />
                    <span>详情</span>
                 </button>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className={`block text-[10px] font-bold px-2 py-0.5 rounded-full mb-0.5 ${pdf.type === 'github' ? 'bg-gray-100 text-gray-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {pdf.version}
              </span>
              {pdf.size !== 'Unknown' && <span className="block text-[10px] text-gray-400">{pdf.size}</span>}
            </div>
          </div>
          
          <h3 className={`font-medium line-clamp-2 mb-2 leading-tight text-base transition-colors ${isActive ? 'text-indigo-900' : 'text-gray-800'}`}>
            {pdf.name}
          </h3>
          
          <div className="mt-auto flex items-center justify-between text-xs text-gray-400">
            <span className="truncate max-w-[60%] flex items-center gap-1">
              {pdf.sourceName}
            </span>
            <span>{pdf.date}</span>
          </div>
        </div>

        <div className="flex border-t border-gray-100 divide-x divide-gray-100 bg-gray-50/50">
          <button 
            onClick={(e) => { e.stopPropagation(); onPreview(pdf); }}
            className="flex-1 py-3 flex items-center justify-center gap-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
          >
            <Eye className="w-4 h-4" />
            预览
          </button>
          <a 
            href={pdf.downloadUrl}
            target="_blank" // Added target blank for download reliability
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()} 
            className="flex-1 py-3 flex items-center justify-center gap-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <Download className="w-4 h-4" />
            下载
          </a>
        </div>
      </div>
    );
  };

  // --- Context Sheet ---
  const ContextSheet = ({ pdf, onClose, onPreview }) => {
    const [tags, setTags] = useState([]);
    const [description, setDescription] = useState('');
    const [loadingInfo, setLoadingInfo] = useState(false);
    
    const panelMaxHeightRef = useRef(window.innerHeight * 0.85);

    useEffect(() => {
      if (pdf?.type === 'github' && pdf?.owner && pdf?.repo) {
        setLoadingInfo(true);
        fetch(`https://api.github.com/repos/${pdf.owner}/${pdf.repo}`)
          .then(res => res.json())
          .then(data => {
            if (data.topics) setTags(data.topics);
            if (data.description) setDescription(data.description);
          })
          .catch(err => console.error("Failed to fetch repo info", err))
          .finally(() => setLoadingInfo(false));
      }
    }, [pdf]);

    if (!pdf) return null;

    const repoLink = pdf.type === 'github' ? `https://github.com/${pdf.owner}/${pdf.repo}` : pdf.url;

    return (
      <div 
        className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200 touch-none" 
        onClick={onClose}
      >
        <div 
          style={{ maxHeight: `${panelMaxHeightRef.current}px` }}
          className="bg-white rounded-t-2xl p-6 pb-8 w-full max-w-3xl mx-auto animate-in slide-in-from-bottom duration-300 overflow-y-auto overscroll-contain touch-pan-y" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-4 mb-5">
             <div className={`p-3 rounded-xl shrink-0 ${pdf.type === 'github' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
               {pdf.type === 'github' ? <Github className="w-8 h-8" /> : <Globe className="w-8 h-8" />}
             </div>
             <div className="overflow-hidden flex-1">
               <h3 className="text-lg font-bold text-gray-900 leading-snug line-clamp-2">{pdf.name}</h3>
               <p className="text-sm text-gray-500 mt-1 truncate">{pdf.sourceName} • {pdf.version}</p>
             </div>
          </div>

          {pdf.type === 'github' && (
            <div className="mb-6 space-y-5">
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">项目描述</h4>
                <SmartDescription text={description} loading={loadingInfo} />
              </div>

              {tags.length > 0 && (
                <div>
                   <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">标签</h4>
                   <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <span key={tag} className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100 hover:bg-blue-100 transition-colors">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
               <button 
                  onClick={() => { onClose(); onPreview(pdf); }}
                  className="flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-200 active:bg-indigo-700 transition-colors"
               >
                  <Eye className="w-5 h-5" />
                  <span className="font-medium">预览文件</span>
               </button>
               
               <a 
                  href={pdf.downloadUrl}
                  target="_blank" // Target blank to force download in new tab if blocked
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 text-gray-700 rounded-xl active:bg-gray-50 transition-colors"
               >
                  <Download className="w-5 h-5" />
                  <span className="font-medium">下载文件</span>
               </a>
            </div>
            
            <a 
               href={repoLink}
               target="_blank" 
               rel="noreferrer"
               className="flex items-center justify-center gap-2 p-3 text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-xl transition-colors text-sm"
            >
               {pdf.type === 'github' ? <ExternalLink className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
               <span className="font-medium">{pdf.type === 'github' ? '访问 GitHub 仓库' : '访问原始链接'}</span>
            </a>
          </div>

          <button 
            onClick={onClose}
            className="w-full mt-4 py-3 text-gray-400 text-sm font-medium active:text-gray-600"
          >
            关闭
          </button>
        </div>
      </div>
    );
  };

  const PreviewModal = ({ pdf, onClose }) => {
    if (!pdf) return null;
    const previewUrl = `https://docs.google.com/gview?url=${encodeURIComponent(pdf.downloadUrl)}&embedded=true`;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-0 md:p-4">
        <div className="w-full h-full max-w-5xl bg-white md:rounded-lg flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="flex items-center justify-between p-3 border-b bg-gray-50">
            <div className="flex flex-col overflow-hidden">
              <h3 className="font-medium text-gray-800 truncate text-sm md:text-base">{pdf.name}</h3>
              <span className="text-xs text-gray-500 truncate flex items-center gap-1">
                 {pdf.sourceName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a href={pdf.downloadUrl} target="_blank" rel="noreferrer" className="p-2 text-blue-600 hover:bg-blue-50 rounded-full" title="下载">
                <Download className="w-5 h-5" />
              </a>
              <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          <div className="flex-1 bg-gray-200 relative">
            <iframe src={previewUrl} className="w-full h-full border-none" title="PDF Preview"></iframe>
            <div className="absolute bottom-0 w-full bg-white/80 text-[10px] text-center py-1 text-gray-500 backdrop-blur-sm">
              如果预览加载失败，请点击右上角下载图标直接浏览。
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        * { -webkit-tap-highlight-color: transparent !important; }
      `}</style>
      
      <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20 select-none">
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-600 cursor-pointer" onClick={() => window.scrollTo(0,0)}>
              <BookOpen className="w-6 h-6" />
              <h1 className="font-bold text-lg">我的云书架</h1>
            </div>
            <div className="flex gap-2">
               <button onClick={handleRefresh} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto p-4">
          {pdfs.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {pdfs.map(pdf => (
                <PdfCard 
                  key={pdf.uniqueId} 
                  pdf={pdf} 
                  isActive={activeCardId === pdf.uniqueId}
                  onSelect={() => setActiveCardId(pdf.uniqueId)}
                  onPreview={setSelectedPdf} 
                  onOpenMenu={setContextMenuPdf}
                />
              ))}
            </div>
          ) : !isLoading && (
             <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-center">
               <BookOpen className="w-16 h-16 text-gray-200 mb-4" />
               <p className="text-lg text-gray-500">书架空空如也</p>
               <p className="text-sm text-gray-400 mb-6">{errorMsg || "添加一些 GitHub 仓库或 PDF 链接吧"}</p>
               <button onClick={() => setIsSettingsOpen(true)} className="px-6 py-2 bg-indigo-600 text-white rounded-full font-medium shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-transform active:scale-95">
                 管理内容源
               </button>
             </div>
          )}
        </main>

        {/* --- Settings Panel --- */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-40 bg-gray-100 flex flex-col animate-in slide-in-from-bottom-10 duration-200">
            <div className="bg-white shadow-sm px-4 h-14 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-lg">内容源管理</h2>
              <button 
                onClick={() => {
                  setIsSettingsOpen(false);
                  if(sources.length > 0) fetchAllPdfs(sources);
                }} 
                className="p-2 text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
              <div className="bg-white rounded-xl shadow-sm p-5 mb-6 overflow-visible">
                <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                  <button 
                    onClick={() => setActiveTab('github')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'github' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    <Github className="w-4 h-4" /> GitHub 仓库
                  </button>
                  <button 
                    onClick={() => setActiveTab('link')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'link' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    <LinkIcon className="w-4 h-4" /> 网络直链
                  </button>
                </div>

                {activeTab === 'github' && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">GitHub 用户名/组织</label>
                      <input 
                        type="text" 
                        value={ghOwner}
                        onChange={(e) => {
                          setGhOwner(e.target.value);
                          setSuggestedRepos([]); 
                          setRepoFetchError(null);
                        }}
                        placeholder="例如: google"
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div ref={dropdownRef} className="relative z-50">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">仓库名称</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={ghRepo}
                          onFocus={() => { if (ghOwner && suggestedRepos.length === 0) searchRepos(''); else if(suggestedRepos.length > 0) setShowSuggestions(true); }}
                          onChange={(e) => setGhRepo(e.target.value)}
                          placeholder={isFetchingRepos ? "搜索中..." : "输入以搜索..."}
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                        {isFetchingRepos && <Loader2 className="absolute right-3 top-3 w-5 h-5 text-indigo-500 animate-spin" />}
                        {!isFetchingRepos && suggestedRepos.length > 0 && (
                          <ChevronDown 
                            className={`absolute right-3 top-3 w-5 h-5 text-gray-400 transition-transform cursor-pointer ${showSuggestions ? 'rotate-180' : ''}`} 
                            onClick={() => setShowSuggestions(!showSuggestions)}
                          />
                        )}
                      </div>
                      {showSuggestions && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                          {repoFetchError ? (
                            <div className="p-3 text-sm text-orange-500 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {repoFetchError}</div>
                          ) : suggestedRepos.length > 0 ? (
                            <ul>
                              {suggestedRepos.map((repoName) => (
                                <li 
                                  key={repoName}
                                  onMouseDown={() => handleSuggestionClick(repoName)}
                                  className="px-4 py-3 hover:bg-indigo-50 cursor-pointer text-sm text-gray-700 border-b border-gray-50 last:border-none flex items-center justify-between group"
                                >
                                  <span>{repoName}</span>
                                  <Plus className="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100" />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="p-3 text-sm text-gray-400 italic">无匹配项</div>
                          )}
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={addGithubSource}
                      disabled={!ghOwner || !ghRepo}
                      className="bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors"
                    >
                      <Plus className="w-5 h-5" /> 添加 GitHub 源
                    </button>
                  </div>
                )}

                {activeTab === 'link' && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">PDF 链接 (URL)</label>
                      <input 
                        type="url" 
                        value={linkUrl}
                        onChange={handleLinkUrlChange}
                        placeholder="https://example.com/file.pdf"
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">文档名称 (Title)</label>
                      <input 
                        type="text" 
                        value={linkName}
                        onChange={(e) => setLinkName(e.target.value)}
                        placeholder="会自动提取，也可手动修改"
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <button 
                      onClick={addLinkSource}
                      disabled={!linkUrl || !linkName}
                      className="bg-emerald-600 text-white p-3 rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors"
                    >
                      <Plus className="w-5 h-5" /> 添加直链
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3 pb-10">
                <h3 className="text-sm font-bold text-gray-700 px-1">已添加的源 ({sources.length})</h3>
                {sources.map(source => (
                  <div key={source.id} className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    {source.type === 'github' || !source.type ? (
                      <div className="flex items-center gap-3 overflow-hidden flex-1">
                        <div className="bg-gray-100 p-2 rounded-full flex-shrink-0">
                          <Github className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{source.repo}</p>
                          <p className="text-xs text-gray-500 truncate">{source.owner}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 overflow-hidden flex-1">
                        <div className="bg-emerald-100 p-2 rounded-full flex-shrink-0">
                          <Globe className="w-5 h-5 text-emerald-600" />
                        </div>
                        {editingSourceId === source.id ? (
                           <div className="flex items-center gap-2 w-full mr-2">
                             <input 
                               className="flex-1 p-1 border rounded text-sm"
                               value={editNameValue}
                               onChange={(e) => setEditNameValue(e.target.value)}
                               autoFocus
                             />
                             <button onClick={() => saveEditing(source.id)} className="text-emerald-600"><Save className="w-4 h-4"/></button>
                           </div>
                        ) : (
                          <div className="min-w-0 flex items-center gap-2">
                            <div className="min-w-0">
                               <p className="font-medium text-gray-800 truncate">{source.name}</p>
                               <p className="text-xs text-gray-500 truncate">{new URL(source.url).hostname}</p>
                            </div>
                            <button onClick={() => startEditing(source)} className="text-gray-300 hover:text-gray-600 p-1">
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <button 
                      onClick={() => removeSource(source.id)}
                      className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {contextMenuPdf && (
          <ContextSheet 
            pdf={contextMenuPdf} 
            onClose={() => setContextMenuPdf(null)} 
            onPreview={setSelectedPdf}
          />
        )}

        {selectedPdf && (
          <PreviewModal pdf={selectedPdf} onClose={() => setSelectedPdf(null)} />
        )}
      </div>
    </>
  );
}
