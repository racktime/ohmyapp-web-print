import { useState, useEffect, Fragment, useRef } from 'react';
import {
  Br,
  Cut,
  Line,
  Printer,
  Row,
  render,
  Text,
} from 'react-thermal-printer';

// -------------------------------------------------------------------
// (가정) API 함수들 - 실제 환경에 맞게 수정 필요
// -------------------------------------------------------------------
// (가정 1) listDocument 함수 (제공해주신 getNotices 참고)
const listDocument = async (document) => {
  // ... 실제 API 호출 로직 ...
  console.log("API REQ (list):", document.documentJson);
  // --- 가짜 응답 (테스트용) ---
  // 3초마다 가짜 주문이 1개씩 들어오는 것처럼 시뮬레이션합니다.
  if (Math.random() < 0.3) { // 30% 확률로 새 주문 1개
    return { 
      data: [{
        "_id": { "$oid": `fake-id-${Date.now()}` },
        "inOutStatus": "regularTakeout",
        "lineItems": [{
            "productName": "새로 들어온 주문", "quantity": 1,
            "productVariants": [{ "optionName": "테스트", "optionPrice": 15000 }]
        }],
        "orderId": { "$oid": `fake-order-${Date.now()}` },
        "orderRequest": "빨리 주세요",
        "storeName": "강변상회",
        "storeId": { "$oid": "68b6b64e5c3389ba39ad18b2" },
        "printStatus": "pending",
        "_createTime": { "$date": Date.now() },
      }]
    };
  }
  return { data: [] }; // 70% 확률로 새 주문 없음
};

// (가정 2) updateDocument 함수 (인쇄 완료 처리를 위해 필수)
const updateDocument = async (document) => {
  // ... 실제 API 호출 로직 ...
  console.log("API REQ (update):", document.documentJson);
  return { success: true };
};

// (가정 3) aggregateDocument 함수 (오늘 날짜 집계용)
const aggregateDocument = async (document) => {
  // ... 실제 API 호출 로직 ...
  console.log("API REQ (aggregate):", document.documentJson);
  // --- 가짜 응답 (테스트용) ---
  return { data: [{ totalOrders: 5, totalAmount: 125000 }] };
};
// -------------------------------------------------------------------


// --- 헬퍼 함수 1: 영수증 JSX 생성 (이전과 동일) ---
const createReceipt = (data, copyType) => {
  const total = data.lineItems.reduce((acc, item) => {
    const variantPrice = item.productVariants.reduce((pAcc, v) => pAcc + v.optionPrice, 0);
    return acc + (variantPrice * item.quantity);
  }, 0);

  const formatTimestamp = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ko-KR', { /* ... 포맷 옵션 ... */ });
    } catch (e) { return "날짜 오류"; }
  };

  return (
    <Printer type="epson" width={42} characterSet="korea">
      <Text align="center" bold={true} size={{ width: 2, height: 2 }}>{copyType}</Text>
      <Line />
      <Text bold={true} size={{ width: 2, height: 2 }}>
        주문번호: {data.orderId.$oid.slice(-6).toUpperCase()}
      </Text>
      <Text bold={true}>{data.inOutStatus === 'regularTakeout' ? '[포장]' : '[매장]'}</Text>
      <Text>포장일: {formatTimestamp(data._createTime.$date).split(' ')[0]}</Text>
      <Line />
      <Row left="메뉴" right="수량" />
      <Line />
      {data.lineItems.map((item, index) => (
        <Fragment key={index}>
          <Text bold={true}>
            {item.productName} ({item.productVariants.map(v => v.optionName).join('/')})
          </Text>
          <Row 
            left={`  └ ${item.productVariants.map(v => `${v.optionPrice.toLocaleString()}원`).join(', ')}`}
            right={item.quantity.toString()} 
          />
        </Fragment>
      ))}
      <Line />
      <Row 
        left={<Text bold={true} size={{ width: 2, height: 2 }}>총결제금액</Text>} 
        right={<Text bold={true} size={{ width: 2, height: 2 }}>{total.toLocaleString()}원</Text>} 
      />
      <Line />
      <Text bold={true}>[요청사항]</Text>
      <Text>{data.orderRequest || '요청사항 없음'}</Text>
      <Line />
      <Text>거래일시: {formatTimestamp(data._createTime.$date)}</Text>
      <Text>매장: {data.storeName}</Text>
      <Cut />
    </Printer>
  );
};


// --- API 호출 함수 (요청사항 반영) ---

// (오늘 날짜 00:00:00 타임스탬프 생성)
const getTodayStartTime = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { "$date": today.getTime() };
};

// 1. 오늘 날짜의 건수/총액 집계 API 호출 함수
const getTodaysStats = async (storeId) => {
  const document = {
    collectionName: "receiptList",
    documentJson: {
      $match: {
        storeId: { "$oid": storeId },
        _createTime: { $gte: getTodayStartTime() } // 오늘 0시 이후
      },
      // $group을 사용하여 집계
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        // lineItems 배열을 풀고(unwind), 그 안의 optionPrice를 합산
        // (이 부분은 실제 DB 구조에 맞게 더 복잡한 파이프라인이 필요할 수 있습니다)
        // totalAmount: { $sum: ... } 
      }
    }
  };
  
  try {
    // 집계 API (aggregateDocument) 호출 (가정)
    const response = await aggregateDocument(document);
    if (response && response.data && response.data.length > 0) {
      return { 
        count: response.data[0].totalOrders || 0,
        total: 0 // (총액 집계는 DB 구조에 따라 구현 필요)
      };
    }
    return { count: 0, total: 0 };
  } catch (error) {
    console.error("getTodaysStats API 호출 중 오류:", error);
    return { count: 0, total: 0 };
  }
};

// 2. 인쇄할 영수증 목록 조회 API 호출 함수 (storeId 파라미터 추가)
const getReceiptsToPrint = async (storeId) => {
  const document = {
    collectionName: "receiptList",
    documentJson: {
      $match: {
        printStatus: { $ne: "done" }, // 인쇄 안 된 것
        storeId: { "$oid": storeId }  // [요청사항] storeId로 필터링
      },
      $sort: { 
        _createTime: 1 // 오래된 순서
      },
      $limit: 10 // 한 번에 10개씩만 처리 (서버 과부하 방지)
    },
  };

  try {
    const response = await listDocument(document);
    return response.data || [];
  } catch (error) {
    console.error("getReceiptsToPrint API 호출 중 오류:", error);
    return [];
  }
};

// 3. 인쇄 완료 처리 API 호출 함수
const updatePrintStatus = async (receiptId) => {
  const document = {
    collectionName: "receiptList",
    documentJson: {
      $match: {
        _id: { "$oid": receiptId }
      },
      $set: {
        printStatus: "done"
      }
    }
  };
  try {
    await updateDocument(document); // (가정)
  } catch (error) {
    console.error("updatePrintStatus API 호출 중 오류:", error);
  }
};

// --- React 컴포넌트 ---
export default function App() {
  const [port, setPort] = useState(null);
  const [isBusy, setIsBusy] = useState(false); // (이름 변경) 연결 중이거나 인쇄 중
  const [log, setLog] = useState("프린터를 연결해주세요.");
  
  // (임시) 스토어 ID - 실제로는 로그인 정보 등에서 가져와야 함
  const [storeId, setStoreId] = useState("68b6b64e5c3389ba39ad18b2"); 

  // [요청사항] 오늘 날짜 집계 상태
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 });
  const [currentDate, setCurrentDate] = useState(new Date().getDate());

  // 폴링(setInterval)을 제어하기 위한 ref
  const intervalRef = useRef(null);

  // --- 인쇄 로직 (단일 영수증 처리) ---
  const printReceipt = async (connectedPort, receipt) => {
    const writer = connectedPort.writable?.getWriter();
    if (writer == null) {
      console.error("Writer를 가져올 수 없습니다.");
      throw new Error("Writer를 가져올 수 없습니다.");
    }

    try {
      setLog(`주문번호 [${receipt.orderId.$oid.slice(-6)}] 인쇄 시작...`);
      
      // 1. 매장용 생성 및 인쇄
      const merchantReceipt = createReceipt(receipt, "매장용");
      const merchantData = await render(merchantReceipt);
      await writer.write(merchantData);

      // 2. 고객용 생성 및 인쇄
      const customerReceipt = createReceipt(receipt, "고객용");
      const customerData = await render(customerReceipt);
      await writer.write(customerData);

      setLog(`주문번호 [${receipt.orderId.$oid.slice(-6)}] 인쇄 완료!`);

    } catch (err) {
      console.error("인쇄 중 오류:", err);
      setLog(`인쇄 오류: ${err.message}`);
    } finally {
      writer.releaseLock();
      console.log("Writer 락 해제됨.");
    }
  };

  // --- 폴링 로직 (3초마다 실행) ---
  const pollForReceipts = async () => {
    if (isBusy) return; // 이미 인쇄 중이면 건너뛰기

    // [요청사항] 날짜가 바뀌었는지 확인
    const newDate = new Date().getDate();
    if (newDate !== currentDate) {
      setLog("날짜가 변경되었습니다. 집계를 초기화합니다.");
      setCurrentDate(newDate);
      const stats = await getTodaysStats(storeId);
      setTodayStats(stats);
    }

    // 인쇄할 새 영수증 가져오기
    const receiptsToPrint = await getReceiptsToPrint(storeId);

    if (receiptsToPrint.length > 0) {
      setIsBusy(true); // 인쇄 시작 (폴링 중단)
      setLog(`[${receiptsToPrint.length}개]의 새 주문을 인쇄합니다...`);

      for (const receipt of receiptsToPrint) {
        // 1. 실제 인쇄 실행
        await printReceipt(port, receipt);
        
        // 2. 인쇄 완료 API 호출 (필수!)
        await updatePrintStatus(receipt._id.$oid);
        
        // 3. (가정) 집계 업데이트
        // (실제로는 getTodaysStats를 다시 호출하는 것이 더 정확합니다)
        setTodayStats(prev => ({ 
          count: prev.count + 1, 
          total: prev.total /* + receipt.total */ 
        }));
      }

      setLog("모든 인쇄 완료. 폴링을 다시 시작합니다.");
      setIsBusy(false); // 인쇄 완료 (폴링 재개)
    } else {
      setLog("새 주문 대기 중... (3초마다 확인)");
    }
  };

  // --- 포트 연결/해제 로직 ---
  const handleConnect = async () => {
    if (isBusy) return;
    setIsBusy(true); 

    if (port) {
      // 이미 연결된 상태 -> 연결 해제
      try {
        if (intervalRef.current) {
          clearInterval(intervalRef.current); // 폴링 중단
          intervalRef.current = null;
        }
        // (참고) Web Serial API는 명시적인 'close'가 writer/reader를 통해 처리됨
        // 여기서는 간단히 port를 null로 만들어 연결 해제를 시뮬레이션합니다.
        await port.close(); // 포트 닫기
        setPort(null);
        setLog("프린터 연결이 해제되었습니다.");
      } catch (err) {
        console.warn("포트 닫기 실패:", err);
        setPort(null); // 강제 해제
      } finally {
        setIsBusy(false);
      }
      
    } else {
      // 새 연결 시도
      try {
        setLog("포트 선택 팝업창을 확인하세요...");
        const _port = await navigator.serial.requestPort();
        await _port.open({ baudRate: 38400, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
        setPort(_port); // ★ 포트가 연결됨 -> useEffect가 실행됨
        setLog("프린터 연결 성공!");
      } catch (err) {
        console.warn("작업이 취소되었거나 실패했습니다:", err);
        setLog(`연결 실패: ${err.message}`);
      } finally {
        setIsBusy(false);
      }
    }
  };

  // --- 포트가 연결되면 폴링을 시작/중지하는 useEffect ---
  useEffect(() => {
    if (port && !intervalRef.current) {
      // 포트가 연결됨: 즉시 1회 실행 + 3초마다 폴링 시작
      setLog("연결됨. 오늘 주문 집계 및 폴링 시작...");
      
      (async () => {
        // 1. 초기 집계 실행
        const stats = await getTodaysStats(storeId);
        setTodayStats(stats);
        
        // 2. 즉시 1회 실행
        await pollForReceipts();
        
        // 3. 3초마다 폴링 설정
        intervalRef.current = setInterval(pollForReceipts, 3000);
      })();

    } else if (!port && intervalRef.current) {
      // 포트 연결이 끊어짐: 폴링 중단
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setLog("연결 끊어짐. 폴링이 중지되었습니다.");
    }

    // 컴포넌트 언마운트 시 인터벌 정리
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [port, isBusy, storeId, currentDate]); // port나 isBusy 상태가 바뀔 때마다 체크

  return (
    <main>
      <h2>React Thermal Printer (Polling)</h2>
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <button 
          type="button" 
          onClick={handleConnect}
          disabled={isBusy && !port} // 연결 시도 중에만 비활성화
        >
          {isBusy ? "작업 중..." : (port ? "프린터 연결 해제" : "프린터 연결")}
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', padding: '10px', background: '#f9f9f9' }}>
        <h3>[상태] {log}</h3>
        <p>
          [오늘 집계] 총 주문: <strong>{todayStats.count}건</strong> / 
          총 매출: <strong>{todayStats.total.toLocaleString()}원</strong>
        </p>
        <p>(storeId: {storeId})</p>
      </div>
    </main>
  );
}