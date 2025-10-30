import { useState, useEffect, Fragment } from 'react';
import {
  Br,
  Cut,
  Line,
  Printer,
  Row,
  render,
  Text,
} from 'react-thermal-printer';

// --- 헬퍼 함수 1: JSON 데이터를 받아서 영수증 JSX를 생성합니다. ---
const createReceipt = (data, copyType) => {
  const total = data.lineItems.reduce((acc, item) => {
    const variantPrice = item.productVariants.reduce((pAcc, v) => pAcc + v.optionPrice, 0);
    return acc + (variantPrice * item.quantity);
  }, 0);

  const formatTimestamp = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      return "날짜 오류";
    }
  };

  return (
    <Printer type="epson" width={42} characterSet="korea">
      <Text align="center" bold={true} size={{ width: 2, height: 2 }}>
        {copyType}
      </Text>
      <Line />
      <Text bold={true} size={{ width: 2, height: 2 }}>
        주문번호: {data.orderId.$oid.slice(-6).toUpperCase()}
      </Text>
      <Text bold={true}>
        {data.inOutStatus === 'regularTakeout' ? '[포장]' : '[매장]'}
      </Text>
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
            
            // --- [수정된 부분] ---
            // right prop은 문자열을 받아야 합니다.
            right={item.quantity.toString()} 
            // ---------------------
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

// --- 헬퍼 함수 2: 하드코딩된 JSON 응답 데이터 ---
const getResponseData = () => ({
    "_id": { "$oid": "69031625a2e64607f3e221c7" },
    "inOutStatus": "regularTakeout",
    "lineItems": [
        {
            "productName": "대방어 모둠회",
            "productPrice": 0,
            "quantity": 1,
            "productVariants": [
                { "optionName": "중", "optionPrice": 100000 }
            ],
            "price": 0
        }
    ],
    "orderId": { "$oid": "69031618100968283c250d72" },
    "orderRequest": "식당 이용(고객 직접 예약)",
    "storeName": "강변상회",
    "storeId": { "$oid": "68b6b64e5c3389ba39ad18b2" },
    "printStatus": "done",
    "_createTime": { "$date": 1761809957365 },
    "_updateTime": { "$date": 1761809959547 }
});

export default function App() {
  const [port, setPort] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false); 

  const printToPort = async (connectedPort) => {
    const responseData = getResponseData();
    const writer = connectedPort.writable?.getWriter();
    if (writer == null) {
      console.error("Writer를 가져올 수 없습니다.");
      return;
    }

    try {
      console.log("매장용 인쇄 데이터 생성...");
      const merchantReceipt = createReceipt(responseData, "매장용");
      const merchantData = await render(merchantReceipt);
      
      console.log('전송할 데이터 (매장용):', merchantData);
      await writer.write(merchantData);
      console.log("매장용 인쇄 완료!");

      console.log("고객용 인쇄 데이터 생성...");
      const customerReceipt = createReceipt(responseData, "고객용");
      const customerData = await render(customerReceipt);
      
      console.log('전송할 데이터 (고객용):', customerData);
      await writer.write(customerData);
      console.log("고객용 인쇄 완료!");

    } catch (err) {
      console.error("인쇄 중 오류:", err);
    } finally {
      writer.releaseLock();
      console.log("Writer 락 해제됨.");
    }
  };

  const handleConnect = async () => {
    if (isConnecting) {
      console.log("현재 작업 중입니다.");
      return;
    }
    setIsConnecting(true); 

    try {
      if (port) {
        console.log("이미 연결됨, 다시 인쇄합니다.");
        await printToPort(port);
      } else {
        const _port = await navigator.serial.requestPort();
        
        await _port.open({ 
          baudRate: 38400, // (예: 38400 - 환경에 맞게 테스트)
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          flowControl: 'none'
        });
        
        setPort(_port); 
      }
    } catch (err) {
      console.warn("작업이 취소되었거나 실패했습니다:", err);
    } finally {
      setIsConnecting(false); 
    }
  };

  useEffect(() => {
    if (port && !isConnecting) {
      console.log("포트 연결됨. 자동 인쇄를 시작합니다.");
      (async () => {
        setIsConnecting(true);
        await printToPort(port);
        setIsConnecting(false);
      })();
    }
  }, [port]);

  return (
    <main>
      <h2>React Thermal Printer (Web Serial)</h2>
      <p>프린터를 연결하고 버튼을 눌러주세요.</p>
      
      <div style={{ marginTop: 24 }}>
        <button 
          type="button" 
          onClick={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? "작업 중..." : (port ? "다시 인쇄하기" : "프린터 연결 및 자동인쇄")}
        </button>
      </div>
    </main>
  );
}