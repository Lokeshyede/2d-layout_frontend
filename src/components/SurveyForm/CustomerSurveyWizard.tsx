import React, { useState, useRef, useEffect } from 'react';
import { api, type CreateSurveyPayload, type SurveyResponseData } from '../../services/api';
import { User, Store, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

interface CustomerSurveyWizardProps {
  onSurveyCreated: (surveyData: SurveyResponseData) => void;
  onCancel: () => void;
}

export const CustomerSurveyWizard: React.FC<CustomerSurveyWizardProps> = ({ onSurveyCreated, onCancel }) => {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSurvey, setCreatedSurvey] = useState<SurveyResponseData | null>(null);

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [whatsAppNumber, setWhatsAppNumber] = useState('');
  const [email, setEmail] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('Supermarket');
  const [storeArea, setStoreArea] = useState('');
  const [approxWidth, setApproxWidth] = useState("50'-0\"");
  const [approxHeight, setApproxHeight] = useState("30'-0\"");
  const [roomShapeMode, setRoomShapeMode] = useState<'AUTO' | 'MANUAL'>('AUTO');

  const [surveyDate, setSurveyDate] = useState(new Date().toISOString().split('T')[0]);
  const [salesmanName, setSalesmanName] = useState('');
  const [siteContactPerson, setSiteContactPerson] = useState('');
  const [remarks, setRemarks] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');

  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const handleManualRedirect = () => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    if (createdSurvey) {
      onSurveyCreated(createdSurvey);
    }
  };


  const storeTypes = [
    'Supermarket',
    'Grocery Store',
    'General Store',
    'Garment Store',
    'Pharmacy',
    'Electronics',
    'Other',
  ];

  const validateStep1 = () => {
    if (!customerName.trim()) {
      setError('Please enter the Customer / Store Name.');
      return false;
    }
    if (!mobileNumber.trim()) {
      setError('Please enter a valid Mobile Number.');
      return false;
    }
    if (mobileNumber.trim().length < 10) {
      setError('Please enter a valid 10-digit Mobile Number.');
      return false;
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email)) {
      setError('Please enter a valid email address.');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!storeType) {
      setError('Please select a Store Type.');
      return false;
    }
    if (!approxWidth.trim()) {
      setError('Please enter an approximate store width.');
      return false;
    }
    if (!approxHeight.trim()) {
      setError('Please enter an approximate store length / depth.');
      return false;
    }
    if (!surveyDate) {
      setError('Please enter the Survey Date.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setError(null);
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) {
      handleNext();
      return;
    }
    if (!validateStep1()) {
      setStep(1);
      return;
    }

    setLoading(true);
    setError(null);

    const payload: CreateSurveyPayload = {
      customer: {
        customerName: customerName.trim(),
        ownerName: ownerName.trim() || undefined,
        mobileNumber: mobileNumber.trim(),
        whatsAppNumber: whatsAppNumber.trim() || mobileNumber.trim(),
        email: email.trim() || undefined,
        storeAddress: storeAddress.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
      },
      store: {
        storeName: (storeName.trim() || customerName.trim()),
        storeType,
        storeArea: storeArea.trim() || undefined,
        approxWidth: approxWidth.trim() || "50'-0\"",
        approxHeight: approxHeight.trim() || "30'-0\"",
        unit: 'Feet + Inches',
        roomShapeMode,
      },
      survey: {
        surveyDate,
        salesmanName: salesmanName.trim() || undefined,
        siteContactPerson: siteContactPerson.trim() || ownerName.trim() || undefined,
        remarks: remarks.trim() || undefined,
        specialRequirements: specialRequirements.trim() || undefined,
      },
    };

    try {
      const surveyRes = await api.createSurvey(payload);

      setCreatedSurvey(surveyRes);

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (err) {
        // ignore
      }

      redirectTimeoutRef.current = setTimeout(() => {
        onSurveyCreated(surveyRes);
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to create survey. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {createdSurvey && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center space-y-5 animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Survey Created Successfully!</h2>
              <p className="text-slate-700 text-sm">Your unique Survey ID and 2D CAD canvas are ready.</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Survey ID</p>
              <p className="text-2xl font-extrabold text-retailfix-red-600 font-mono tracking-tight">{createdSurvey.surveyId}</p>
              <p className="text-xs text-slate-600">Customer: {createdSurvey.customer.customerName}</p>
            </div>

            <p className="text-xs text-slate-600 italic">Redirecting to 2D CAD Layout Designer in a moment...</p>

            <button
              onClick={handleManualRedirect}
              className="w-full bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
            >
              Open 2D CAD Designer Now
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="text-center space-y-2 mb-8">
        <div className="inline-flex items-center gap-2 bg-retailfix-red-50 border border-retailfix-red-200 text-retailfix-red-700 px-3 py-1 rounded-full text-xs font-semibold uppercase">
          <Sparkles className="w-3.5 h-3.5 text-retailfix-red-600" />
          RetailFix Store Survey Form
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900">Store Survey & Site Details</h1>
        <p className="text-sm text-slate-700 max-w-xl mx-auto">
          Complete the survey information below. Submitting will immediately open the 2D CAD Designer.
        </p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 mb-8">
        <div className="grid grid-cols-3 gap-2">
          {[
            { num: 1, label: 'Information Form' },
            { num: 2, label: 'Additional Details' },
            { num: 3, label: 'Final Confirmation' },
          ].map((s) => {
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <div
                key={s.num}
                onClick={() => isDone && setStep(s.num)}
                className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                  isDone ? 'cursor-pointer' : ''
                } ${isActive ? 'bg-retailfix-red-50 border border-retailfix-red-200' : ''}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isActive
                      ? 'bg-retailfix-red-600 text-white'
                      : isDone
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">STEP {s.num}</p>
                  <p className={`text-xs font-bold ${isActive ? 'text-retailfix-red-700' : 'text-slate-700'}`}>
                    {s.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 sm:hidden text-center border-t border-slate-100 pt-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Step {step} of 3</p>
          <p className="text-sm font-bold text-slate-800">
            {step === 1 ? 'Information Form' : step === 2 ? 'Additional Details' : 'Final Confirmation'}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-white border-l-4 border-red-500 shadow-sm p-4 rounded-r-lg mb-6 flex items-start gap-3 text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {step === 1 && (
          <div className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-retailfix-red-600" />
                Section 1 — Customer & Owner Details
              </h2>
              <p className="text-xs text-slate-700 mt-1">Please provide customer name and primary contact details.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="customerName" className="text-xs font-bold text-slate-700 flex items-center gap-1">Customer / Store Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metro Supermarket / Apex Retailers" id="customerName"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (!storeName) setStoreName(e.target.value);
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ownerName" className="text-xs font-bold text-slate-700">Owner Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rajesh Kumar" id="ownerName"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mobileNumber" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +91 98765 43210" id="mobileNumber"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="whatsAppNumber" className="text-xs font-bold text-slate-700">WhatsApp Number</label>
                <input
                  type="tel"
                  placeholder="Same as mobile or alternate" id="whatsAppNumber"
                  value={whatsAppNumber}
                  onChange={(e) => setWhatsAppNumber(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-bold text-slate-700">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. contact@metroretail.com" id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="storeAddress" className="text-xs font-bold text-slate-700">Store Address</label>
                <textarea
                  rows={2}
                  placeholder="Shop No., Commercial Complex, Street Name..." id="storeAddress"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="city" className="text-xs font-bold text-slate-700">City</label>
                <input
                  type="text"
                  placeholder="e.g. Bengaluru / Mumbai" id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="state" className="text-xs font-bold text-slate-700">State</label>
                <input
                  type="text"
                  placeholder="e.g. Karnataka" id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pincode" className="text-xs font-bold text-slate-700">Pincode</label>
                <input
                  type="text"
                  placeholder="e.g. 560001" id="pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-retailfix-red-600" />
                Section 2 — Store Category, Dimensions & Survey Details
              </h2>
              <p className="text-xs text-slate-700 mt-1">Specify retail type, room boundaries, and field notes.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  Store Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {storeTypes.map((st) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setStoreType(st)}
                      className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${
                        storeType === st
                          ? 'bg-retailfix-red-600 text-white border-retailfix-red-600 shadow-md shadow-red-900/20'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="storeArea" className="text-xs font-bold text-slate-700">Store Area (Approx)</label>
                  <input
                    type="text"
                    placeholder="e.g. 2400 sq ft" id="storeArea"
                    value={storeArea || ''}
                    onChange={(e) => setStoreArea(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="approxWidth" className="text-xs font-bold text-slate-700 flex items-center gap-1">Approx. Width (Ft + In) <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. 50'-0&quot;" id="approxWidth"
                    value={approxWidth || ''}
                    onChange={(e) => setApproxWidth(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500 font-mono font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="approxHeight" className="text-xs font-bold text-slate-700 flex items-center gap-1">Approx. Length / Depth <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. 30'-0&quot;" id="approxHeight"
                    value={approxHeight || ''}
                    onChange={(e) => setApproxHeight(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500 font-mono font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <label className="text-xs font-bold text-slate-700">Room Creation Mode</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRoomShapeMode('AUTO')}
                    className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      roomShapeMode === 'AUTO'
                        ? 'bg-retailfix-red-50 border-retailfix-red-500 ring-1 ring-retailfix-red-500'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      roomShapeMode === 'AUTO' ? 'border-retailfix-red-600 bg-retailfix-red-600' : 'border-slate-300'
                    }`}>
                      {roomShapeMode === 'AUTO' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${roomShapeMode === 'AUTO' ? 'text-retailfix-red-900' : 'text-slate-700'}`}>AUTO</p>
                      <p className="text-xs text-slate-500 mt-1">Automatically create a rectangular room using the entered Width and Length.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRoomShapeMode('MANUAL')}
                    className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      roomShapeMode === 'MANUAL'
                        ? 'bg-retailfix-red-50 border-retailfix-red-500 ring-1 ring-retailfix-red-500'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      roomShapeMode === 'MANUAL' ? 'border-retailfix-red-600 bg-retailfix-red-600' : 'border-slate-300'
                    }`}>
                      {roomShapeMode === 'MANUAL' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${roomShapeMode === 'MANUAL' ? 'text-retailfix-red-900' : 'text-slate-700'}`}>MANUAL</p>
                      <p className="text-xs text-slate-500 mt-1">Start with a blank CAD canvas and draw the actual store shape yourself.</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div className="space-y-1.5">
                  <label htmlFor="surveyDate" className="text-xs font-bold text-slate-700 flex items-center gap-1">Survey Date <span className="text-red-500">*</span></label>
                  <input
                    type="date" id="surveyDate"
                    value={surveyDate || ''}
                    onChange={(e) => setSurveyDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="salesmanName" className="text-xs font-bold text-slate-700">Salesman / Surveyor Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Suresh Surveyor" id="salesmanName"
                    value={salesmanName || ''}
                    onChange={(e) => setSalesmanName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="siteContactPerson" className="text-xs font-bold text-slate-700">Site Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Store Manager / Site In-charge" id="siteContactPerson"
                    value={siteContactPerson || ''}
                    onChange={(e) => setSiteContactPerson(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="remarks" className="text-xs font-bold text-slate-700">Remarks / Site Conditions</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Corner store with 2 entry rolling shutters, pillar projections on north wall..." id="remarks"
                    value={remarks || ''}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="specialRequirements" className="text-xs font-bold text-slate-700">Special Fixture Requirements</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Requires 4ft center gondolas with grocery mesh dividers and glass gate entry..." id="specialRequirements"
                    value={specialRequirements || ''}
                    onChange={(e) => setSpecialRequirements(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 focus:border-retailfix-red-500 text-sm text-slate-900 bg-white placeholder-slate-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-retailfix-red-600" />
                Section 3 — Final Confirmation
              </h2>
              <p className="text-xs text-slate-700 mt-1">Review your information and create the CAD layout.</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Survey Summary Overview</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-700 block text-[10px]">Customer</span>
                  <strong className="text-slate-800">{customerName || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-700 block text-[10px]">Mobile</span>
                  <strong className="text-slate-800">{mobileNumber || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-700 block text-[10px]">Store Type</span>
                  <strong className="text-slate-800">{storeType}</strong>
                </div>
                <div>
                  <span className="text-slate-700 block text-[10px]">Dimensions</span>
                  <strong className="text-slate-800 font-mono">{approxWidth} × {approxHeight}</strong>
                </div>
                <div>
                  <span className="text-slate-700 block text-[10px]">CAD Mode</span>
                  <strong className="text-slate-800">{roomShapeMode}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-50 px-6 sm:px-8 py-4 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 disabled:text-slate-400 disabled:bg-slate-100 disabled:border-slate-200 disabled:cursor-not-allowed font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-700 font-semibold text-xs shadow-sm transition-colors"
            >
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-bold text-xs px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-md transition-all"
            >
              Continue to Step {step + 1}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="bg-retailfix-red-600 hover:bg-retailfix-red-700 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold text-sm px-8 py-3 rounded-xl shadow-lg shadow-red-900/30 flex items-center gap-2 transition-all hover:scale-105 disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Generating CAD Project...
                </>
              ) : (
                <>
                  <Store className="w-4 h-4" />
                  CREATE STORE LAYOUT
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
